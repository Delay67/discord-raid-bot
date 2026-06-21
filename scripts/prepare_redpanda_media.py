import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageSequence


DEFAULT_MEDIA_DIR = Path(__file__).resolve().parents[1] / "data" / "redpandas"
GIF_EXTENSIONS = {".gif"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".m4v", ".mov", ".mp4", ".webm"}
MEDIA_EXTENSIONS = GIF_EXTENSIONS | IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


def bytes_from_mb(value):
    return int(value * 1024 * 1024)


def format_size(size):
    return f"{size / 1024 / 1024:.2f} MB"


def iter_media_files(directory):
    for path in sorted(directory.rglob("*")):
        if (
            path.is_file()
            and path.suffix.lower() in MEDIA_EXTENSIONS
            and ".discord" not in path.stem
        ):
            yield path


def output_path_for(path, extension):
    return path.with_name(f"{path.stem}.discord{extension}")


def is_animated_image(path):
    try:
        with Image.open(path) as image:
            return sum(1 for _ in ImageSequence.Iterator(image)) > 1
    except OSError:
        return False


def compress_image(path, output_path, max_bytes):
    with Image.open(path) as image:
        image.thumbnail((1600, 1600))

        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        quality = 88
        while quality >= 45:
            image.save(output_path, "JPEG", optimize=True, quality=quality)

            if output_path.stat().st_size <= max_bytes:
                return True

            quality -= 8

        width, height = image.size
        while output_path.stat().st_size > max_bytes and min(width, height) > 480:
            width = int(width * 0.85)
            height = int(height * 0.85)
            resized = image.resize((width, height))
            resized.save(output_path, "JPEG", optimize=True, quality=60)

        return output_path.stat().st_size <= max_bytes


def run_ffmpeg(command):
    result = subprocess.run(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip().splitlines()[-1])


def ensure_ffmpeg():
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not installed")


def compress_gif(path, output_path, max_bytes):
    ensure_ffmpeg()

    attempts = [
        {"fps": "15", "scale": "640:-1"},
        {"fps": "12", "scale": "540:-1"},
        {"fps": "10", "scale": "480:-1"},
        {"fps": "8", "scale": "360:-1"}
    ]

    for attempt in attempts:
        if output_path.exists():
            output_path.unlink()

        run_ffmpeg([
            "ffmpeg",
            "-y",
            "-i",
            str(path),
            "-vf",
            f"fps={attempt['fps']},scale={attempt['scale']}:flags=lanczos",
            "-loop",
            "0",
            str(output_path)
        ])

        if output_path.stat().st_size <= max_bytes:
            return True

    return output_path.exists() and output_path.stat().st_size <= max_bytes


def compress_video(path, output_path, max_bytes):
    ensure_ffmpeg()

    attempts = [
        {"crf": "30", "scale": "720:-2"},
        {"crf": "34", "scale": "640:-2"},
        {"crf": "38", "scale": "540:-2"},
        {"crf": "42", "scale": "480:-2"}
    ]

    for attempt in attempts:
        if output_path.exists():
            output_path.unlink()

        run_ffmpeg([
            "ffmpeg",
            "-y",
            "-i",
            str(path),
            "-vf",
            f"scale={attempt['scale']}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            attempt["crf"],
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            str(output_path)
        ])

        if output_path.stat().st_size <= max_bytes:
            return True

    return output_path.exists() and output_path.stat().st_size <= max_bytes


def get_existing_output(path, extensions, max_bytes, force):
    for extension in extensions:
        output_path = output_path_for(path, extension)

        if not output_path.exists():
            continue

        if force:
            output_path.unlink()
            continue

        output_size = output_path.stat().st_size

        if 0 < output_size <= max_bytes:
            return output_path

        output_path.unlink()

    return None


def compress_file(path, max_bytes, force):
    extension = path.suffix.lower()

    if extension in GIF_EXTENSIONS:
        existing_output = get_existing_output(path, [".gif", ".mp4"], max_bytes, force)

        if existing_output:
            return "exists", existing_output

        gif_output_path = output_path_for(path, ".gif")

        if compress_gif(path, gif_output_path, max_bytes):
            return "compressed", gif_output_path

        mp4_output_path = output_path_for(path, ".mp4")

        if compress_video(path, mp4_output_path, max_bytes):
            return "compressed", mp4_output_path

        return "too-large", mp4_output_path if mp4_output_path.exists() else gif_output_path

    output_extension = ".mp4" if extension in VIDEO_EXTENSIONS else ".jpg"
    output_path = output_path_for(path, output_extension)

    existing_output = get_existing_output(path, [output_extension], max_bytes, force)

    if existing_output:
        return "exists", existing_output

    if extension in IMAGE_EXTENSIONS and not is_animated_image(path):
        ok = compress_image(path, output_path, max_bytes)
    else:
        ok = compress_video(path, output_path, max_bytes)

    return ("compressed" if ok else "too-large"), output_path


def main():
    parser = argparse.ArgumentParser(
        description="Create Discord-sized copies of oversized local red panda media."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        default=DEFAULT_MEDIA_DIR,
        help=f"Media directory to scan. Default: {DEFAULT_MEDIA_DIR}"
    )
    parser.add_argument(
        "--max-mb",
        type=float,
        default=9.5,
        help="Target maximum file size in MiB. Default: 9.5"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild existing .discord compressed copies."
    )
    parser.add_argument(
        "--delete-originals",
        action="store_true",
        help="Delete each oversized original after a successful compressed copy is ready."
    )
    args = parser.parse_args()

    directory = args.directory.expanduser().resolve()
    max_bytes = bytes_from_mb(args.max_mb)

    if not directory.exists():
        print(f"Directory does not exist: {directory}")
        return 1

    checked = 0
    oversized = 0
    compressed = 0
    deleted = 0
    failed = 0

    print(f"Scanning {directory}")
    print(f"Compressing files over {format_size(max_bytes)}")

    for path in iter_media_files(directory):
        checked += 1
        size = path.stat().st_size

        if size <= max_bytes:
            continue

        oversized += 1
        print(f"Large: {path} ({format_size(size)})")

        try:
            status, output_path = compress_file(path, max_bytes, args.force)
        except Exception as error:
            failed += 1
            print(f"  failed: {error}")
            continue

        output_size = output_path.stat().st_size if output_path.exists() else 0

        if status in {"compressed", "exists"} and output_size <= max_bytes:
            compressed += 1
            print(f"  {status}: {output_path} ({format_size(output_size)})")

            if args.delete_originals:
                path.unlink()
                deleted += 1
                print(f"  deleted original: {path}")
        else:
            failed += 1
            print(f"  still too large: {output_path} ({format_size(output_size)})")

    print()
    print(f"Checked: {checked}")
    print(f"Oversized: {oversized}")
    print(f"Ready compressed copies: {compressed}")
    print(f"Deleted originals: {deleted}")
    print(f"Failed: {failed}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
