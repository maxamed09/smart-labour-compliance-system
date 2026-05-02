const path = require("path");
const fs = require("fs/promises");

const DB_PATH = path.resolve(__dirname, "..", "data", "db.json");

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.access(DB_PATH);
}

async function readDb() {
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  const tempPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, DB_PATH);
}

module.exports = {
  DB_PATH,
  ensureDb,
  readDb,
  writeDb,
};
