const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDashboard,
  buildLabourDashboard,
  computeControlRisk,
  calculateWorkHours,
  assessWorkLog,
  applyAssessment,
  applyEvidence,
  applyWorkLog,
} = require("../src/complianceEngine");
const {
  authenticateUser,
  createUser,
  createSession,
  getSession,
  sessionCookie,
} = require("../src/auth");

function sampleDb() {
  return {
    organization: { name: "Test Co" },
    labourRules: {
      dailyHoursLimit: 9,
      weeklyHoursLimit: 48,
      regularHoursPerDay: 8,
      overtimeLimitPerDay: 2,
      minimumHourlyWage: 178
    },
    workforce: { departments: [] },
    users: [
      {
        id: "EMP-A",
        name: "Ravi Kumar",
        email: "ravi@example.com",
        role: "employee",
        profile: {
          department: "Warehouse",
          site: "Pune",
          hourlyRate: 190,
          minimumHourlyWage: 178
        }
      },
      {
        id: "EMP-B",
        name: "Meera Iyer",
        email: "meera@example.com",
        role: "employee",
        profile: {
          department: "Manufacturing",
          site: "Chennai",
          hourlyRate: 172,
          minimumHourlyWage: 178
        }
      },
      {
        id: "MGR-A",
        name: "Nikhil Sharma",
        email: "manager@example.com",
        role: "employer",
        profile: {
          department: "People Operations",
          site: "All sites"
        }
      }
    ],
    workLogs: [],
    controls: [
      {
        id: "CTL-A",
        title: "Payroll",
        category: "Compensation",
        status: "watch",
        owner: "Payroll",
        dueDate: "2026-05-01",
        lastAssessed: "2026-04-01",
        requiredData: ["gross wage", "site"],
        prohibitedCollection: ["personal browsing"],
        privacyControls: ["aggregate first"],
        dataSensitivity: 4,
        evidenceNeeded: ["payroll extract"]
      },
      {
        id: "CTL-B",
        title: "Safety",
        category: "Safety",
        status: "pending",
        owner: "Safety",
        dueDate: "2026-07-01",
        lastAssessed: null,
        requiredData: ["training"],
        prohibitedCollection: ["health telemetry"],
        privacyControls: ["separate injury detail"],
        dataSensitivity: 3,
        evidenceNeeded: ["training log"]
      }
    ],
    evidence: [],
    assessments: [],
    audit: []
  };
}

test("dashboard summarizes control coverage and open actions", () => {
  const dashboard = buildDashboard(sampleDb(), { today: "2026-04-28" });

  assert.equal(dashboard.summary.totalControls, 2);
  assert.equal(dashboard.summary.coverage, 50);
  assert.equal(dashboard.summary.watch, 1);
  assert.equal(dashboard.summary.pending, 1);
  assert.ok(dashboard.summary.riskScore > 0);
});

test("risk rises when a review is overdue", () => {
  const control = sampleDb().controls[0];
  const beforeDueDate = computeControlRisk(control, new Date("2026-04-20T00:00:00Z"));
  const afterDueDate = computeControlRisk(control, new Date("2026-05-20T00:00:00Z"));

  assert.ok(afterDueDate > beforeDueDate);
});

test("assessment updates the related control and audit trail", () => {
  const db = sampleDb();
  const assessment = applyAssessment(db, {
    controlId: "CTL-A",
    status: "compliant",
    owner: "Payroll Lead",
    dueDate: "2026-06-30",
    notes: "Reviewed with masked payroll sample.",
    evidenceRefs: ["payroll extract"]
  });

  assert.match(assessment.id, /^ASM-/);
  assert.equal(db.controls[0].status, "compliant");
  assert.equal(db.assessments.length, 1);
  assert.equal(db.audit[0].action, "assessment.created");
});

test("evidence requires a valid control and next review date", () => {
  const db = sampleDb();
  const evidence = applyEvidence(db, {
    controlId: "CTL-A",
    title: "Payroll proof",
    type: "Summary",
    source: "Payroll",
    retention: "12 months",
    accessLevel: "Restricted",
    personalData: "Pseudonymized",
    nextReview: "2026-06-01"
  });

  assert.match(evidence.id, /^EVD-/);
  assert.equal(db.evidence.length, 1);
  assert.equal(db.audit[0].action, "evidence.created");
});

test("work hour calculation supports same-day and overnight shifts", () => {
  assert.equal(calculateWorkHours("09:00", "17:30"), 8.5);
  assert.equal(calculateWorkHours("22:00", "06:00"), 8);
});

test("labour rule engine flags daily hours, overtime, and wage violations", () => {
  const db = sampleDb();
  const employee = db.users[1];
  const result = assessWorkLog({
    userId: employee.id,
    date: "2026-04-28",
    startTime: "08:00",
    endTime: "18:30",
    totalHours: 10.5,
    overtimeHours: 2.5,
    wagePaid: 1700
  }, employee, db.labourRules);

  assert.equal(result.status, "at_risk");
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "daily_hours",
    "overtime_limit",
    "minimum_wage"
  ]);
});

test("employees can create only their own work logs", () => {
  const db = sampleDb();
  const workLog = applyWorkLog(db, {
    userId: "EMP-B",
    date: "2026-04-28",
    startTime: "09:00",
    endTime: "17:00",
    overtimeHours: 0,
    wagePaid: 1520
  }, db.users[0]);

  assert.equal(workLog.userId, "EMP-A");
  assert.equal(db.workLogs.length, 1);
  assert.equal(db.audit[0].action, "worklog.created");
});

test("labour dashboard filters employee views to their own records", () => {
  const db = sampleDb();
  applyWorkLog(db, {
    userId: "EMP-A",
    date: "2026-04-28",
    startTime: "09:00",
    endTime: "17:00",
    overtimeHours: 0,
    wagePaid: 1520
  }, db.users[2]);
  applyWorkLog(db, {
    userId: "EMP-B",
    date: "2026-04-28",
    startTime: "08:00",
    endTime: "18:30",
    overtimeHours: 2.5,
    wagePaid: 1700
  }, db.users[2]);

  const employeeDashboard = buildLabourDashboard(db, { viewer: db.users[0] });
  const employerDashboard = buildLabourDashboard(db, { viewer: db.users[2] });

  assert.equal(employeeDashboard.workLogs.length, 1);
  assert.equal(employeeDashboard.workLogs[0].userId, "EMP-A");
  assert.equal(employerDashboard.workLogs.length, 2);
  assert.equal(employerDashboard.summary.violationCount, 1);
});

test("authentication validates the seeded demo user", () => {
  const db = sampleDb();
  db.users = [
    {
      id: "USR-001",
      name: "Asha Mehta",
      email: "admin@labourcontrol.local",
      role: "Compliance Administrator",
      passwordSalt: "lc-demo-2026",
      passwordHash: "939644aad10e2daf42ed41c8768f925001917ce66618cb974acb24bb9a9f9956"
    }
  ];

  const user = authenticateUser(db, "admin@labourcontrol.local", "Compliance@2026");
  const session = createSession(user);

  assert.equal(user.role, "Compliance Administrator");
  assert.match(session.sessionId, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(getSession({ headers: { cookie: sessionCookie(session.sessionId, session.expiresAt) } }).user.email, user.email);
});

test("signup requires matching confirmed password", () => {
  const db = sampleDb();

  assert.throws(() => createUser(db, {
    name: "New Worker",
    email: "new.worker@example.com",
    role: "employee",
    password: "Password@2026",
    confirmPassword: "WrongPassword@2026"
  }), /Passwords do not match/);

  const user = createUser(db, {
    name: "New Worker",
    email: "new.worker@example.com",
    role: "employee",
    password: "Password@2026",
    confirmPassword: "Password@2026"
  });

  assert.equal(user.email, "new.worker@example.com");
  assert.equal(user.role, "employee");
});

test("signup rejects duplicate email addresses", () => {
  const db = sampleDb();

  createUser(db, {
    name: "New Worker",
    email: "duplicate.worker@example.com",
    role: "employee",
    password: "Password@2026",
    confirmPassword: "Password@2026"
  });

  assert.throws(() => createUser(db, {
    name: "Duplicate Worker",
    email: "duplicate.worker@example.com",
    role: "employee",
    password: "Password@2026",
    confirmPassword: "Password@2026"
  }), /already exists/);
});
