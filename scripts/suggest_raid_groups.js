const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildSuggestions,
  formatSuggestionsReport
} = require("../src/services/raidOptimizer");

const rootDirectory = path.join(__dirname, "..");
const importerPath = path.join(rootDirectory, "scripts", "import_raids_from_xlsx.py");

function parseArgs(argv) {
  const args = {
    count: 3,
    iterations: 60000,
    input: path.join(rootDirectory, "data", "raids.json"),
    variety: 3
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--options") {
      args.count = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--search") {
      args.iterations = Number(argv[index + 1]) * 20000;
      index += 1;
      continue;
    }

    if (arg === "--variety") {
      args.variety = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    args.input = path.resolve(arg);
  }

  return args;
}

function readRaids(inputPath) {
  if (inputPath.toLowerCase().endsWith(".xlsx")) {
    return JSON.parse(
      execFileSync("python", [importerPath, inputPath, "--json"], {
        cwd: rootDirectory,
        encoding: "utf8"
      })
    );
  }

  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

const args = parseArgs(process.argv);
const raids = readRaids(args.input);
const result = buildSuggestions({
  count: args.count,
  iterations: args.iterations,
  raids,
  variety: args.variety
});

console.log(formatSuggestionsReport(result));
