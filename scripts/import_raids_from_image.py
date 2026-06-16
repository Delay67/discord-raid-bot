import argparse
import json
import math
import re
import sys
import time
from collections import deque
from pathlib import Path

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Missing dependency: Pillow. Run: python -m pip install -r scripts/requirements.txt")
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAIDS_PATH = ROOT / "data" / "raids.json"
PYTESSERACT = None

COLOR_PALETTE = {
    "Red": (224, 92, 96),
    "Orange": (255, 153, 0),
    "Yellow": (255, 204, 64),
    "Green": (100, 180, 90),
    "Cyan": (0, 210, 220),
    "Blue": (150, 180, 220),
    "Purple": (120, 80, 170),
    "Pink": (238, 90, 185),
    "Brown": (140, 50, 25),
    "Gray": (150, 150, 150),
}

KNOWN_RAIDS = ("Serca", "Cathedral")
KNOWN_DIFFICULTIES = ("Nightmare", "Hard", "Normal", "2", "3")


def normalize_player_name(name):
    return name.strip().split("-")[0].strip().lower()


def clean_text(value):
    return re.sub(r"\s+", " ", value.replace("|", " ")).strip()


def get_pytesseract():
    global PYTESSERACT

    if PYTESSERACT is not None:
        return PYTESSERACT

    try:
        import pytesseract
    except ImportError:
        print("Missing dependency: pytesseract. Run: python -m pip install -r scripts/requirements.txt")
        sys.exit(1)

    PYTESSERACT = pytesseract
    return PYTESSERACT


def prepare_for_ocr(image):
    image = image.convert("L")
    image = ImageOps.autocontrast(image)
    image = ImageEnhance.Contrast(image).enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    return image.resize((image.width * 3, image.height * 3))


def ocr_text(image, psm=6):
    pytesseract = get_pytesseract()
    prepared = prepare_for_ocr(image)
    config = f"--psm {psm}"

    try:
        return clean_text(pytesseract.image_to_string(prepared, config=config))
    except pytesseract.TesseractNotFoundError:
        print("Tesseract OCR was not found.")
        print("Install it, then rerun this script. On Windows, try: winget install UB-Mannheim.TesseractOCR")
        sys.exit(1)


def is_foreground(pixel):
    r, g, b = pixel[:3]
    return max(r, g, b) > 45


def find_components(image):
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    components = []

    def index(x, y):
        return y * width + x

    for y in range(height):
        for x in range(width):
            start = index(x, y)
            if visited[start] or not is_foreground(pixels[x, y]):
                continue

            queue = deque([(x, y)])
            visited[start] = 1
            min_x = max_x = x
            min_y = max_y = y
            count = 0

            while queue:
                cx, cy = queue.popleft()
                count += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)

                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue

                    next_index = index(nx, ny)
                    if visited[next_index] or not is_foreground(pixels[nx, ny]):
                        continue

                    visited[next_index] = 1
                    queue.append((nx, ny))

            box_width = max_x - min_x + 1
            box_height = max_y - min_y + 1

            if box_width >= 260 and 28 <= box_height <= 80 and count >= 2000:
                components.append((min_x, min_y, max_x + 1, max_y + 1))

    return sorted(components, key=lambda box: (box[1], box[0]))


def average_color(image):
    pixels = list(image.convert("RGB").getdata())
    colored = [
        pixel
        for pixel in pixels
        if max(pixel) > 80 and not (pixel[0] < 80 and pixel[1] < 80 and pixel[2] < 80)
    ]

    if not colored:
        return (0, 0, 0)

    return tuple(sum(pixel[channel] for pixel in colored) / len(colored) for channel in range(3))


def nearest_color_name(rgb):
    best_name = "Unknown"
    best_distance = math.inf

    for name, palette_rgb in COLOR_PALETTE.items():
        distance = sum((rgb[index] - palette_rgb[index]) ** 2 for index in range(3))
        if distance < best_distance:
            best_name = name
            best_distance = distance

    return best_name


def parse_raid_label(text):
    lowered = text.lower()
    raid_name = next((raid for raid in KNOWN_RAIDS if raid.lower() in lowered), None)
    difficulty = next(
        (
            difficulty
            for difficulty in KNOWN_DIFFICULTIES
            if re.search(rf"\b{re.escape(difficulty.lower())}\b", lowered)
        ),
        None,
    )

    if raid_name and not difficulty:
        number = re.search(r"\b([23])\b", lowered)
        if number:
            difficulty = number.group(1)

    return raid_name, difficulty


def classify_role(member_body):
    _, g, b = average_color(member_body)
    return "Support" if b - g > 4 else "DPS"


def parse_member_name(text):
    candidates = re.findall(r"[A-Za-z][A-Za-z0-9]+(?:-[A-Za-z0-9]+)?", clean_text(text))
    ignored = {"sorc", "slayer", "souleader", "glavier", "gunslinger", "artist", "bard", "breaker"}

    for candidate in candidates:
        if candidate.lower() not in ignored:
            return candidate.split("-")[0]

    return None


def expand_to_raid_block(image, box):
    x1, y1, x2, y2 = box
    block_height = y2 - y1
    label_width = min(130, max(80, round((x2 - x1) * 0.2)))
    return (
        max(0, x1 - label_width),
        max(0, y1 - round(block_height * 0.6)),
        x2,
        y2,
    )


def parse_component(image, box, debug=False):
    box = expand_to_raid_block(image, box)
    crop = image.crop(box)
    width, height = crop.size
    label_width = max(90, min(130, round(width * 0.18)))
    label_crop = crop.crop((0, 0, label_width, height))
    label_text = ocr_text(label_crop, psm=6)
    raid_name, difficulty = parse_raid_label(label_text)

    if not raid_name or not difficulty:
        if debug:
            print(f"Skipped {box}: could not parse raid label from OCR text: {label_text!r}")
        return None

    color = nearest_color_name(average_color(label_crop))
    member_area_x = label_width
    member_width = (width - member_area_x) / 4
    members = []

    for index in range(4):
        left = round(member_area_x + index * member_width)
        right = round(member_area_x + (index + 1) * member_width)
        header_crop = crop.crop((left, 0, right, max(16, round(height * 0.42))))
        body_crop = crop.crop((left, max(16, round(height * 0.36)), right, height))
        member_name = parse_member_name(ocr_text(header_crop, psm=7))

        if not member_name:
            if debug:
                print(f"Skipped member slot {index + 1} in {box}: OCR text was {ocr_text(header_crop, psm=7)!r}")
            continue

        members.append(
            {
                "name": member_name,
                "lookupName": normalize_player_name(member_name),
                "role": classify_role(body_crop),
            }
        )

    if not members:
        if debug:
            print(f"Skipped {box}: no member names parsed")
        return None

    return {
        "id": "",
        "color": color,
        "name": raid_name,
        "difficulty": difficulty,
        "members": members,
        "createdBy": "image-import",
        "createdAt": "",
    }


def parse_image(image_path, debug=False):
    image = Image.open(image_path).convert("RGB")
    raids = []
    boxes = find_components(image)

    if debug:
        print(f"Image size: {image.size[0]}x{image.size[1]}")
        print(f"Detected {len(boxes)} candidate raid member block(s)")

    for box in boxes:
        raid = parse_component(image, box, debug=debug)
        if raid:
            raids.append(raid)

    now_ms = int(time.time() * 1000)
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for index, raid in enumerate(raids):
        raid["id"] = str(now_ms + index)
        raid["createdAt"] = created_at

    return raids


def preview_raids(raids):
    print()
    print(f"Parsed {len(raids)} raid(s):")
    print()

    for index, raid in enumerate(raids, start=1):
        members = ", ".join(f"{member['name']} ({member['role']})" for member in raid["members"])
        print(f"{index:>2}. {raid['color']} {raid['name']} {raid['difficulty']} - {members}")

    print()


def write_raids(raids_path, raids):
    raids_path.parent.mkdir(parents=True, exist_ok=True)
    raids_path.write_text(json.dumps(raids, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Import fixed raid groups from a schedule screenshot into data/raids.json."
    )
    parser.add_argument("image", type=Path, help="Path to the schedule screenshot")
    parser.add_argument("--output", type=Path, default=DEFAULT_RAIDS_PATH, help="Path to raids.json")
    parser.add_argument(
        "--tesseract-command",
        help="Optional full path to tesseract.exe if it is not on PATH",
    )
    parser.add_argument("--debug", action="store_true", help="Print parser diagnostics")
    args = parser.parse_args()

    if args.tesseract_command:
        pytesseract = get_pytesseract()
        pytesseract.pytesseract.tesseract_cmd = args.tesseract_command

    if not args.image.exists():
        print(f"Image not found: {args.image}")
        sys.exit(1)

    raids = parse_image(args.image, debug=args.debug)

    if not raids:
        print("No raids were parsed. Nothing was changed.")
        print("Run again with --debug to see detected blocks and OCR text.")
        sys.exit(1)

    preview_raids(raids)
    approval = input(f"Replace all raids in {args.output} with these results? Type YES to continue: ")

    if approval != "YES":
        print("Import cancelled. Nothing was changed.")
        return

    write_raids(args.output, raids)
    print(f"Imported {len(raids)} raid(s) into {args.output}.")


if __name__ == "__main__":
    main()
