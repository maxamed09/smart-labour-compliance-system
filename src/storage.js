const path = require("path");
const fs = require("fs/promises");

const DB_PATH = path.resolve(__dirname, "..", "data", "db.json");
let memoryDb = null;

function cloneDb(db) {
  return JSON.parse(JSON.stringify(db));
}

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.access(DB_PATH);
}

async function readDb() {
  if (memoryDb) {
    return cloneDb(memoryDb);
  }

  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  if (process.env.VERCEL) {
    memoryDb = cloneDb(db);
    return;
  }

  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, DB_PATH);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  DB_PATH,
  ensureDb,
  readDb,
  writeDb,
};
