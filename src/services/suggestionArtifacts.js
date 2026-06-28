const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const rootDirectory = path.join(__dirname, "..", "..");
const generatorPath = path.join(
  rootDirectory,
  "scripts",
  "generate_suggestion_workbook.py"
);

function getPythonCandidates() {
  if (process.platform === "win32") {
    return [
      path.join(rootDirectory, ".venv", "Scripts", "python.exe"),
      "python"
    ];
  }

  return [
    path.join(rootDirectory, ".venv", "bin", "python"),
    "python3",
    "python"
  ];
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: rootDirectory,
        maxBuffer: 1024 * 1024 * 5
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

async function runGenerator(args) {
  let lastError = null;

  for (const pythonCommand of getPythonCandidates()) {
    try {
      return await execFileAsync(pythonCommand, args);
    } catch (error) {
      lastError = error;

      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw lastError;
}

async function generateSuggestionArtifacts(result) {
  if (!result.suggestions.length) {
    return null;
  }

  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), `raid-suggestions-${crypto.randomUUID()}-`)
  );
  const inputPath = path.join(temporaryDirectory, "suggestions.json");
  const outputDirectory = path.join(temporaryDirectory, "output");

  try {
    await fs.writeFile(
      inputPath,
      `${JSON.stringify({ suggestions: result.suggestions })}\n`,
      "utf8"
    );
    await runGenerator([generatorPath, inputPath, outputDirectory]);

    const workbook = await fs.readFile(
      path.join(outputDirectory, "raid-suggestions.xlsx")
    );
    const images = await Promise.all(
      result.suggestions.map(async (_, index) => ({
        buffer: await fs.readFile(
          path.join(outputDirectory, `raid-suggestion-option-${index + 1}.png`)
        ),
        name: `raid-suggestion-option-${index + 1}.png`
      }))
    );

    return {
      images,
      workbook: {
        buffer: workbook,
        name: "raid-suggestions.xlsx"
      }
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  generateSuggestionArtifacts
};
