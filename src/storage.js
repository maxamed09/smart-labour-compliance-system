const path = require("path");
const fs = require("fs/promises");

const DB_PATH = path.resolve(__dirname, "..", "data", "db.json");
let memoryDb = null;

const FALLBACK_DB = {
  organization: {
    name: "Smart Labour Compliance System",
    jurisdictionMode: "Configurable by site and worker type",
    programOwner: "People Operations",
    privacyOfficer: "Data Protection Lead",
    lastUpdated: "2026-04-28",
  },
  labourRules: {
    dailyHoursLimit: 9,
    weeklyHoursLimit: 48,
    regularHoursPerDay: 8,
    overtimeLimitPerDay: 2,
    minimumHourlyWage: 178,
  },
  users: [
    {
      id: "USR-001",
      name: "Asha Mehta",
      email: "admin@labourcontrol.local",
      role: "Compliance Administrator",
      passwordSalt: "lc-demo-2026",
      passwordHash: "939644aad10e2daf42ed41c8768f925001917ce66618cb974acb24bb9a9f9956",
      profile: {
        department: "People Operations",
        site: "All sites",
      },
    },
    {
      id: "USR-EMP-001",
      name: "Ravi Kumar",
      email: "employee@slcs.local",
      role: "employee",
      passwordSalt: "lc-demo-2026",
      passwordHash: "939644aad10e2daf42ed41c8768f925001917ce66618cb974acb24bb9a9f9956",
      profile: {
        department: "Warehousing",
        site: "Pune Plant",
        hourlyRate: 190,
        minimumHourlyWage: 178,
      },
    },
    {
      id: "USR-MGR-001",
      name: "Nikhil Sharma",
      email: "employer@slcs.local",
      role: "employer",
      passwordSalt: "lc-demo-2026",
      passwordHash: "939644aad10e2daf42ed41c8768f925001917ce66618cb974acb24bb9a9f9956",
      profile: {
        department: "People Operations",
        site: "All sites",
      },
    },
  ],
  workforce: {
    totalWorkers: 3,
    employees: 2,
    contractors: 0,
    locations: 1,
    departments: [
      { name: "Warehousing", count: 1, risk: "stable" },
      { name: "People Operations", count: 1, risk: "stable" },
    ],
  },
  controls: [],
  evidence: [],
  assessments: [],
  audit: [],
  workLogs: [],
};

function cloneDb(db) {
  return JSON.parse(JSON.stringify(db));
}

async function ensureDb() {
  if (process.env.VERCEL) {
    await readDb();
    return;
  }

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.access(DB_PATH);
}

async function readDb() {
  if (memoryDb) {
    return cloneDb(memoryDb);
  }

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (!process.env.VERCEL) {
      throw error;
    }

    console.warn(`Using fallback demo database because ${DB_PATH} could not be read: ${error.message}`);
    return cloneDb(FALLBACK_DB);
  }
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
