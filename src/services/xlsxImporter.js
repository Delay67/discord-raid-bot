const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const rootDirectory = path.join(__dirname, "..", "..");
const dataDirectory = path.join(rootDirectory, "data");
const pendingDirectory = path.join(dataDirectory, "pending-imports");
const raidsPath = path.join(dataDirectory, "raids.json");
const workbookPath = path.join(dataDirectory, "staticsheet.xlsx");
const importerPath = path.join(rootDirectory, "scripts", "import_raids_from_xlsx.py");
const pendingImports = new Map();
const pendingLifetimeMs = 10 * 60 * 1000;

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

async function runImporter(args) {
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

async function saveWorkbookFromAttachment(attachment, targetPath) {
  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(`Failed to download workbook: ${response.status}`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}

async function parseWorkbook(candidateWorkbookPath) {
  const { stdout } = await runImporter([importerPath, candidateWorkbookPath, "--json"]);
  return JSON.parse(stdout);
}

function cleanupExpiredImports() {
  const now = Date.now();

  for (const [importId, pendingImport] of pendingImports.entries()) {
    if (pendingImport.expiresAt > now) {
      continue;
    }

    pendingImports.delete(importId);
    fs.rm(pendingImport.workbookPath, { force: true }).catch(console.error);
  }
}

async function createPendingImport(attachment, userId) {
  cleanupExpiredImports();

  const importId = crypto.randomUUID();
  const pendingWorkbookPath = path.join(pendingDirectory, `${importId}.xlsx`);

  await saveWorkbookFromAttachment(attachment, pendingWorkbookPath);

  const raids = await parseWorkbook(pendingWorkbookPath);
  const pendingImport = {
    attachmentName: attachment.name,
    createdAt: Date.now(),
    expiresAt: Date.now() + pendingLifetimeMs,
    raids,
    userId,
    workbookPath: pendingWorkbookPath
  };

  pendingImports.set(importId, pendingImport);

  return {
    importId,
    raids
  };
}

async function confirmPendingImport(importId, userId) {
  cleanupExpiredImports();

  const pendingImport = pendingImports.get(importId);

  if (!pendingImport) {
    return {
      ok: false,
      message: "That raid import expired. Upload the workbook again."
    };
  }

  if (pendingImport.userId !== userId) {
    return {
      ok: false,
      message: "Only the user who uploaded this workbook can confirm it."
    };
  }

  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.copyFile(pendingImport.workbookPath, workbookPath);
  await fs.writeFile(
    raidsPath,
    `${JSON.stringify(pendingImport.raids, null, 2)}\n`,
    "utf8"
  );
  await fs.rm(pendingImport.workbookPath, { force: true });
  pendingImports.delete(importId);

  return {
    importedCount: pendingImport.raids.length,
    ok: true
  };
}

async function cancelPendingImport(importId, userId) {
  cleanupExpiredImports();

  const pendingImport = pendingImports.get(importId);

  if (!pendingImport) {
    return {
      ok: true
    };
  }

  if (pendingImport.userId !== userId) {
    return {
      ok: false,
      message: "Only the user who uploaded this workbook can cancel it."
    };
  }

  await fs.rm(pendingImport.workbookPath, { force: true });
  pendingImports.delete(importId);

  return {
    ok: true
  };
}

module.exports = {
  cancelPendingImport,
  confirmPendingImport,
  createPendingImport,
  workbookPath
};
