import argparse
import json
import math
import re
import sys
import time
import warnings
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError:
    print("Missing dependency: openpyxl. Run: python -m pip install -r scripts/requirements.txt")
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAIDS_PATH = ROOT / "data" / "raids.json"
DEFAULT_SHEET_NAME = "Serca+Cath"

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
THEME_RGBS = []


def normalize_player_name(name):
    return name.strip().split("-")[0].strip().lower()


def clean_text(value):
    if value is None:
        return ""

    return re.sub(r"\s+", " ", str(value)).strip()


def rgb_from_color(color):
    if color.type == "rgb" and color.rgb:
        value = color.rgb[-6:]
        try:
            return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))
        except ValueError:
            return None

    if color.type == "theme" and color.theme is not None and color.theme < len(THEME_RGBS):
        return THEME_RGBS[color.theme]

    return None


def rgb_from_cell(cell):
    color = cell.fill.fgColor
    return rgb_from_color(color)


def load_theme_rgbs(workbook):
    global THEME_RGBS

    theme_xml = workbook.loaded_theme
    if not theme_xml:
        THEME_RGBS = []
        return

    namespace = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    root = ET.fromstring(theme_xml)
    color_scheme = root.find(".//a:clrScheme", namespace)

    if color_scheme is None:
        THEME_RGBS = []
        return

    colors = []
    for child in list(color_scheme):
        srgb = child.find(".//a:srgbClr", namespace)
        system = child.find(".//a:sysClr", namespace)
        value = srgb.attrib.get("val") if srgb is not None else None
        value = value or (system.attrib.get("lastClr") if system is not None else None)

        if value:
            colors.append(tuple(int(value[index : index + 2], 16) for index in (0, 2, 4)))

    THEME_RGBS = colors


def nearest_color_name(rgb):
    if rgb is None:
        return "Unknown"

    best_name = "Unknown"
    best_distance = math.inf

    for name, palette_rgb in COLOR_PALETTE.items():
        distance = sum((rgb[index] - palette_rgb[index]) ** 2 for index in range(3))
        if distance < best_distance:
            best_name = name
            best_distance = distance

    return best_name


def parse_raid_label(value):
    text = clean_text(value)
    match = re.match(r"^(Serca|Cathedral)\b\s*(.*)$", text, flags=re.IGNORECASE)

    if not match:
        return None, None

    raid_name = next(raid for raid in KNOWN_RAIDS if raid.lower() == match.group(1).lower())
    difficulty = match.group(2).strip()

    if difficulty not in KNOWN_DIFFICULTIES:
        return None, None

    return raid_name, difficulty


def is_raid_label(value):
    raid_name, _ = parse_raid_label(value)
    return raid_name is not None


def classify_role(cell):
    rgb = rgb_from_cell(cell)

    if rgb is None:
        return "DPS"

    _, g, b = rgb
    return "Support" if b - g > 8 else "DPS"


def parse_member_name(value):
    text = clean_text(value)

    if not text:
        return None

    return text.split("-")[0].strip()


def parse_raid_block(sheet, row, col):
    raid_name, difficulty = parse_raid_label(sheet.cell(row=row, column=col).value)

    if not raid_name:
        return None

    members = []
    next_label_col = sheet.max_column + 1

    for scan_col in range(col + 1, sheet.max_column + 1):
        if is_raid_label(sheet.cell(row=row, column=scan_col).value):
            next_label_col = scan_col
            break

    for member_col in range(col + 1, next_label_col):
        member_name = parse_member_name(sheet.cell(row=row, column=member_col).value)

        if not member_name:
            continue

        role_cell = sheet.cell(row=row + 1, column=member_col)
        members.append(
            {
                "name": member_name,
                "lookupName": normalize_player_name(member_name),
                "role": classify_role(role_cell),
            }
        )

        if len(members) == 4:
            break

    if not members:
        return None

    return {
        "id": "",
        "color": nearest_color_name(rgb_from_cell(sheet.cell(row=row, column=col))),
        "name": raid_name,
        "difficulty": difficulty,
        "members": members,
        "createdBy": "xlsx-import",
        "createdAt": "",
        "_sourceCell": sheet.cell(row=row, column=col).coordinate,
    }


def parse_workbook(workbook_path, sheet_name, debug=False):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        workbook = load_workbook(workbook_path, data_only=True)

    load_theme_rgbs(workbook)

    if sheet_name not in workbook.sheetnames:
        available = ", ".join(workbook.sheetnames)
        print(f"Sheet not found: {sheet_name}. Available sheets: {available}")
        sys.exit(1)

    sheet = workbook[sheet_name]
    raids = []

    for row in range(1, sheet.max_row + 1):
        for col in range(1, sheet.max_column + 1):
            value = sheet.cell(row=row, column=col).value

            if not is_raid_label(value):
                continue

            raid = parse_raid_block(sheet, row, col)

            if raid:
                raids.append(raid)
                if debug:
                    print(f"Parsed {raid['_sourceCell']}: {raid['color']} {raid['name']} {raid['difficulty']}")
            elif debug:
                print(f"Skipped {sheet.cell(row=row, column=col).coordinate}: no members parsed")

    now_ms = int(time.time() * 1000)
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for index, raid in enumerate(raids):
        raid["id"] = str(now_ms + index)
        raid["createdAt"] = created_at
        del raid["_sourceCell"]

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
        description="Import fixed raid groups from the Serca+Cath workbook sheet into data/raids.json."
    )
    parser.add_argument("workbook", type=Path, help="Path to the .xlsx workbook")
    parser.add_argument("--sheet", default=DEFAULT_SHEET_NAME, help="Sheet to import")
    parser.add_argument("--output", type=Path, default=DEFAULT_RAIDS_PATH, help="Path to raids.json")
    parser.add_argument("--debug", action="store_true", help="Print parser diagnostics")
    args = parser.parse_args()

    if not args.workbook.exists():
        print(f"Workbook not found: {args.workbook}")
        sys.exit(1)

    raids = parse_workbook(args.workbook, args.sheet, debug=args.debug)

    if not raids:
        print("No raids were parsed. Nothing was changed.")
        print("Make sure the workbook has a sheet named Serca+Cath and visible raid labels like Serca Hard.")
        sys.exit(1)

    preview_raids(raids)
    try:
        approval = input(f"Replace all raids in {args.output} with these results? Type YES to continue: ")
    except EOFError:
        print("Import cancelled. No confirmation was provided.")
        return

    if approval != "YES":
        print("Import cancelled. Nothing was changed.")
        return

    write_raids(args.output, raids)
    print(f"Imported {len(raids)} raid(s) into {args.output}.")


if __name__ == "__main__":
    main()
