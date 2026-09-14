import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WORKBOOK = ROOT / "data" / "staticsheet.xlsx"
DEFAULT_RAIDS_JSON = ROOT / "data" / "raids.json"
DEFAULT_OUTPUT_DIR = ROOT / "data"
DEFAULT_SHEET_NAME = "Serca+Cath"
DEFAULT_OUTPUT_PREFIX = None


NODE_SCRIPT = r"""
const fs = require("node:fs");
const path = require("node:path");
const {
  buildSuggestions,
  formatSuggestionsReport
} = require("./src/services/raidOptimizer");
const {
  generateSuggestionArtifacts
} = require("./src/services/suggestionArtifacts");

(async () => {
  const options = JSON.parse(process.env.RAID_SUGGESTION_OPTIONS || "{}");
  const raids = JSON.parse(fs.readFileSync(options.raidsPath, "utf8"));
  const result = buildSuggestions({
    raids,
    count: options.count,
    fallbackAttempts: options.fallbackAttempts,
    iterations: options.iterations,
    lockMode: options.lockMode,
    preferredAttempts: options.preferredAttempts,
    variety: options.variety
  });
  const report = formatSuggestionsReport(result);

  fs.mkdirSync(options.outputDir, { recursive: true });
  const reportPath = path.join(options.outputDir, `${options.outputPrefix}-report.txt`);
  fs.writeFileSync(reportPath, `${report}\n`, "utf8");

  console.log(report);

  if (!result.suggestions.length) {
    console.log("");
    console.log(`No suggestion images were generated. Report saved to ${reportPath}`);
    return;
  }

  const artifacts = await generateSuggestionArtifacts(result);
  const workbookPath = path.join(options.outputDir, `${options.outputPrefix}.xlsx`);
  fs.writeFileSync(workbookPath, artifacts.workbook.buffer);

  console.log("");
  console.log("Saved artifacts:");
  console.log(`- ${workbookPath}`);
  console.log(`- ${reportPath}`);

  for (const [index, image] of artifacts.images.entries()) {
    const imagePath = path.join(
      options.outputDir,
      `${options.outputPrefix}-option-${index + 1}.png`
    );
    fs.writeFileSync(imagePath, image.buffer);
    console.log(`- ${imagePath}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""


def run(command, *, env=None):
    subprocess.run(command, cwd=ROOT, env=env, check=True)


def import_raids(workbook, sheet_name, raids_json):
    importer = ROOT / "scripts" / "active" / "import_raids_from_xlsx.py"
    run(
        [
            sys.executable,
            str(importer),
            str(workbook),
            "--sheet",
            sheet_name,
            "--output",
            str(raids_json),
            "--yes",
        ]
    )


def generate_suggestions(args):
    env = dict(os.environ)
    env["RAID_SUGGESTION_OPTIONS"] = json.dumps(
        {
            "count": args.options,
            "fallbackAttempts": args.fallback_attempts,
            "iterations": args.iterations,
            "lockMode": args.lock_mode,
            "outputDir": str(args.output_dir),
            "outputPrefix": args.output_prefix,
            "preferredAttempts": args.preferred_attempts,
            "raidsPath": str(args.raids_json),
            "variety": args.variety,
        }
    )
    run(["node", "-e", NODE_SCRIPT], env=env)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Import data/staticsheet.xlsx from the Serca+Cath sheet, then generate "
            "raid optimizer workbook and PNG preview suggestions."
        )
    )
    parser.add_argument(
        "--workbook",
        type=Path,
        default=DEFAULT_WORKBOOK,
        help=f"Workbook to import. Default: {DEFAULT_WORKBOOK}",
    )
    parser.add_argument(
        "--sheet",
        default=DEFAULT_SHEET_NAME,
        help=f"Worksheet to import. Default: {DEFAULT_SHEET_NAME}",
    )
    parser.add_argument(
        "--raids-json",
        type=Path,
        default=DEFAULT_RAIDS_JSON,
        help=f"Where to write the imported raids JSON. Default: {DEFAULT_RAIDS_JSON}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory for workbook, PNGs, and report. Default: {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--output-prefix",
        default=DEFAULT_OUTPUT_PREFIX,
        help=(
            "Output filename prefix. Default: raid-suggestions-<sheet-name>, "
            "for example raid-suggestions-serca-cath"
        ),
    )
    parser.add_argument(
        "--options",
        type=int,
        default=3,
        help="Number of optimizer setups to generate. Default: 3",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=120000,
        help="Optimizer iterations per attempt. Higher is slower but searches harder. Default: 120000",
    )
    parser.add_argument(
        "--preferred-attempts",
        type=int,
        default=None,
        help="Override the number of strict unique-layout attempts. Default: optimizer heuristic.",
    )
    parser.add_argument(
        "--fallback-attempts",
        type=int,
        default=None,
        help="Override the number of relaxed fallback attempts. Default: optimizer heuristic.",
    )
    parser.add_argument(
        "--lock-mode",
        choices=("colored-nightmare", "all-colored", "none"),
        default="colored-nightmare",
        help=(
            "Which imported colored raids are locked. Default: colored-nightmare "
            "locks colored Serca Nightmare groups only."
        ),
    )
    parser.add_argument(
        "--variety",
        type=int,
        default=3,
        help="How much to reward varied player compositions. Default: 3",
    )
    return parser.parse_args()


def slugify_sheet_name(sheet_name):
    slug = re.sub(r"[^a-z0-9]+", "-", sheet_name.lower()).strip("-")
    return slug or "sheet"


def main():
    args = parse_args()
    args.workbook = args.workbook.resolve()
    args.raids_json = args.raids_json.resolve()
    args.output_dir = args.output_dir.resolve()
    if not args.output_prefix:
        args.output_prefix = f"raid-suggestions-{slugify_sheet_name(args.sheet)}"

    if not args.workbook.exists():
        print(f"Workbook not found: {args.workbook}", file=sys.stderr)
        sys.exit(1)

    print(f"Importing {args.workbook}", flush=True)
    print(f"Sheet: {args.sheet}", flush=True)
    import_raids(args.workbook, args.sheet, args.raids_json)

    print("Generating optimizer suggestions...", flush=True)
    generate_suggestions(args)


if __name__ == "__main__":
    main()
