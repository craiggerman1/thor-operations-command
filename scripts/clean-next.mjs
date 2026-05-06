import { rm, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const buildDirs = [".next"];
const retryDelayMs = 450;
const maxAttempts = 8;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function clearWindowsAttributes(targetPath) {
  if (process.platform !== "win32") return;

  try {
    execFileSync("attrib", ["-R", targetPath, "/S", "/D"], { stdio: "ignore" });
  } catch {
    // Attribute cleanup is best-effort only; fs.rm retries below do the real work.
  }
}

async function removeBuildDir(relativePath) {
  const targetPath = path.resolve(process.cwd(), relativePath);
  if (!(await exists(targetPath))) return;

  clearWindowsAttributes(targetPath);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await rm(targetPath, {
        force: true,
        recursive: true,
        maxRetries: 4,
        retryDelay: retryDelayMs
      });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await sleep(retryDelayMs * attempt);
    }
  }
}

for (const buildDir of buildDirs) {
  await removeBuildDir(buildDir);
}
