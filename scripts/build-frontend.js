const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(ROOT, "dist");

function toJsString(value) {
  return JSON.stringify(String(value || "").replace(/\/$/, ""));
}

async function copyDirectory(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      return;
    }

    await fs.copyFile(sourcePath, targetPath);
  }));
}

async function build() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await copyDirectory(PUBLIC_DIR, DIST_DIR);
  await fs.writeFile(
    path.join(DIST_DIR, "runtime-config.js"),
    `window.SLCS_API_BASE_URL = ${toJsString(process.env.SLCS_API_BASE_URL)};\n`,
    "utf8",
  );
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
