const crypto = require("crypto");

const VALID_STATUSES = new Set(["compliant", "watch", "at_risk", "pending"]);
const STATUS_POINTS = {
  compliant: 12,
  watch: 42,
  at_risk: 78,
  pending: 58,
};
const STATUS_LABELS = {
  compliant: "Compliant",
  watch: "Watch",
  at_risk: "At risk",
  pending: "Pending",
};
const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};
const DEFAULT_LABOUR_RULES = {
  dailyHoursLimit: 9,
  weeklyHoursLimit: 48,
  regularHoursPerDay: 8,
  overtimeLimitPerDay: 2,
  minimumHourlyWage: 178,
};

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function makeId(prefix) {
  if (crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function daysUntil(dateString, today = new Date()) {
  if (!dateString) {
    return null;
  }

  const target = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.ceil((target - base) / 86_400_000);
}

function assertDateLike(value, fieldName) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw inputError(`${fieldName} must use YYYY-MM-DD format`);
  }

  return value;
}

function assertTimeLike(value, fieldName) {
  const normalized = normalizeText(value);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw inputError(`${fieldName} must use HH:MM format`);
  }
  return normalized;
}

function normalizeNumber(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw inputError(`${fieldName} must be a non-negative number`);
  }
  return round2(number);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function canManageWorkforce(user) {
  return String(user?.role || "").toLowerCase() !== "employee";
}

function getLabourRules(db) {
  return {
    ...DEFAULT_LABOUR_RULES,
    ...(db.labourRules || {}),
  };
}

function getEmployeeUsers(db) {
  return (db.users || []).filter((user) => String(user.role || "").toLowerCase() === "employee");
}

function findEmployee(db, userId) {
  const employee = getEmployeeUsers(db).find((user) => user.id === userId);
  if (!employee) {
    throw inputError("Employee not found");
  }
  return employee;
}

function publicEmployee(employee) {
  const profile = employee.profile || {};
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    department: profile.department || "Unassigned",
    site: profile.site || "Primary site",
    hourlyRate: Number(profile.hourlyRate || 0),
    minimumHourlyWage: Number(profile.minimumHourlyWage || 0),
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function calculateWorkHours(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  let diff = end - start;

  if (diff <= 0) {
    diff += 24 * 60;
  }

  return round2(diff / 60);
}

function assessWorkLog(log, employee, rules = DEFAULT_LABOUR_RULES) {
  const profile = employee?.profile || {};
  const minimumHourlyWage = Number(profile.minimumHourlyWage || rules.minimumHourlyWage || 0);
  const totalHours = Number(log.totalHours || 0);
  const overtimeHours = Number(log.overtimeHours || 0);
  const wagePaid = Number(log.wagePaid || 0);
  const effectiveHourlyWage = totalHours > 0 ? round2(wagePaid / totalHours) : 0;
  const issues = [];

  if (totalHours > rules.dailyHoursLimit) {
    issues.push({
      code: "daily_hours",
      severity: "high",
      message: `Worked ${totalHours} hours, above the ${rules.dailyHoursLimit} hour daily limit.`,
    });
  }

  if (overtimeHours > rules.overtimeLimitPerDay) {
    issues.push({
      code: "overtime_limit",
      severity: "medium",
      message: `Logged ${overtimeHours} overtime hours, above the ${rules.overtimeLimitPerDay} hour daily overtime threshold.`,
    });
  }

  if (minimumHourlyWage > 0 && effectiveHourlyWage < minimumHourlyWage) {
    issues.push({
      code: "minimum_wage",
      severity: "high",
      message: `Effective wage ${effectiveHourlyWage} is below the minimum wage ${minimumHourlyWage}.`,
    });
  }

  return {
    status: issues.length ? "at_risk" : "compliant",
    issues,
    effectiveHourlyWage,
    minimumHourlyWage,
  };
}

function decorateWorkLog(db, log) {
  const rules = getLabourRules(db);
  const employee = getEmployeeUsers(db).find((user) => user.id === log.userId);
  const compliance = assessWorkLog(log, employee, rules);

  return {
    ...log,
    employeeName: employee?.name || "Unknown employee",
    department: employee?.profile?.department || "Unassigned",
    site: employee?.profile?.site || "Primary site",
    compliance,
  };
}

function buildEmployeeSummary(employee, logs, rules) {
  const decoratedLogs = logs.map((log) => ({
    ...log,
    employeeName: employee.name,
    department: employee.profile?.department || "Unassigned",
    site: employee.profile?.site || "Primary site",
    compliance: assessWorkLog(log, employee, rules),
  }));
  const totalHours = round2(decoratedLogs.reduce((sum, log) => sum + Number(log.totalHours || 0), 0));
  const totalWages = round2(decoratedLogs.reduce((sum, log) => sum + Number(log.wagePaid || 0), 0));
  const violationCount = decoratedLogs.filter((log) => log.compliance.issues.length > 0).length;
  const minimumWageIssues = decoratedLogs.filter((log) => (
    log.compliance.issues.some((issue) => issue.code === "minimum_wage")
  )).length;
  const overtimeIssues = decoratedLogs.filter((log) => (
    log.compliance.issues.some((issue) => issue.code === "overtime_limit" || issue.code === "daily_hours")
  )).length;

  return {
    ...publicEmployee(employee),
    logCount: decoratedLogs.length,
    totalHours,
    averageHours: decoratedLogs.length ? round2(totalHours / decoratedLogs.length) : 0,
    totalWages,
    violationCount,
    minimumWageIssues,
    overtimeIssues,
    status: violationCount > 0 ? "at_risk" : decoratedLogs.length > 0 ? "compliant" : "pending",
    recentLogs: decoratedLogs.slice(0, 6),
  };
}

function sortLogs(logs) {
  return [...logs].sort((left, right) => {
    const dateCompare = String(right.date).localeCompare(String(left.date));
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
}

function buildLabourDashboard(db, options = {}) {
  const rules = getLabourRules(db);
  const viewer = options.viewer;
  const employees = getEmployeeUsers(db);
  const allLogs = sortLogs(db.workLogs || []);
  const visibleLogs = canManageWorkforce(viewer)
    ? allLogs
    : allLogs.filter((log) => log.userId === viewer?.id);
  const decoratedLogs = visibleLogs.map((log) => decorateWorkLog(db, log));
  const employeeRecords = employees
    .filter((employee) => canManageWorkforce(viewer) || employee.id === viewer?.id)
    .map((employee) => buildEmployeeSummary(
      employee,
      sortLogs(allLogs.filter((log) => log.userId === employee.id)),
      rules,
    ));
  const violationLogs = decoratedLogs.filter((log) => log.compliance.issues.length > 0);
  const totalHours = round2(decoratedLogs.reduce((sum, log) => sum + Number(log.totalHours || 0), 0));
  const wageIssues = violationLogs.filter((log) => (
    log.compliance.issues.some((issue) => issue.code === "minimum_wage")
  )).length;
  const overtimeIssues = violationLogs.filter((log) => (
    log.compliance.issues.some((issue) => issue.code === "daily_hours" || issue.code === "overtime_limit")
  )).length;

  return {
    rules,
    employees: employees.map(publicEmployee),
    summary: {
      totalEmployees: employees.length,
      totalLogs: decoratedLogs.length,
      totalHours,
      averageDailyHours: decoratedLogs.length ? round2(totalHours / decoratedLogs.length) : 0,
      violationCount: violationLogs.length,
      wageIssues,
      overtimeIssues,
      compliantLogs: decoratedLogs.length - violationLogs.length,
    },
    workLogs: decoratedLogs.slice(0, 60),
    employeeRecords,
    personalSummary: employeeRecords.find((employee) => employee.id === viewer?.id) || employeeRecords[0] || null,
    violationLogs: violationLogs.slice(0, 60),
    privacyPosture: {
      collected: ["date", "start time", "end time", "total hours", "overtime hours", "wage paid"],
      avoided: ["GPS trail", "screen activity", "audio/video surveillance", "keystroke monitoring"],
      retention: "Manual work logs are kept as compliance evidence and reviewed by exception.",
    },
  };
}

function applyWorkLog(db, payload, actor) {
  const rules = getLabourRules(db);
  const userId = canManageWorkforce(actor)
    ? normalizeText(payload.userId)
    : actor?.id;
  const employee = findEmployee(db, userId);
  const date = assertDateLike(payload.date || todayIso(), "date");
  const startTime = assertTimeLike(payload.startTime, "startTime");
  const endTime = assertTimeLike(payload.endTime, "endTime");
  const totalHours = calculateWorkHours(startTime, endTime);
  const defaultOvertime = Math.max(0, totalHours - Number(rules.regularHoursPerDay || 8));
  const overtimeHours = normalizeNumber(payload.overtimeHours, round2(defaultOvertime), "overtimeHours");
  const hourlyRate = Number(employee.profile?.hourlyRate || 0);
  const defaultWagePaid = round2(totalHours * hourlyRate);
  const wagePaid = normalizeNumber(payload.wagePaid, defaultWagePaid, "wagePaid");

  const workLog = {
    id: makeId("WLOG"),
    userId,
    date,
    startTime,
    endTime,
    totalHours,
    overtimeHours,
    wagePaid,
    source: "manual",
    createdBy: actor?.id || userId,
    createdAt: new Date().toISOString(),
  };

  db.workLogs = db.workLogs || [];
  db.workLogs.unshift(workLog);

  const compliance = assessWorkLog(workLog, employee, rules);
  recordAudit(db, "worklog.created", `Work log recorded for ${employee.name}`, {
    workLogId: workLog.id,
    userId,
    status: compliance.status,
  });

  return {
    ...workLog,
    employeeName: employee.name,
    department: employee.profile?.department || "Unassigned",
    site: employee.profile?.site || "Primary site",
    compliance,
  };
}

function computeControlRisk(control, today = new Date()) {
  const dueIn = daysUntil(control.dueDate, today);
  const base = STATUS_POINTS[control.status] ?? STATUS_POINTS.pending;
  const sensitivity = Number(control.dataSensitivity || 1) * 5;
  const overdue = dueIn !== null && dueIn < 0 ? Math.min(Math.abs(dueIn) * 1.5, 20) : 0;
  const dueSoon = dueIn !== null && dueIn <= 14 && dueIn >= 0 ? 8 : 0;
  return Math.round(clamp(base + sensitivity + overdue + dueSoon, 0, 100));
}

function computeIntrusionScore(control) {
  const requiredFields = control.requiredData || [];
  const avoidedFields = control.prohibitedCollection || [];
  const privacyControls = control.privacyControls || [];
  const base = Number(control.dataSensitivity || 1) * 16;
  const fieldLoad = requiredFields.length * 5;
  const restraint = (avoidedFields.length * 4) + (privacyControls.length * 6);
  return Math.round(clamp(base + fieldLoad - restraint, 5, 100));
}

function buildDashboard(db, options = {}) {
  const today = options.today ? new Date(`${options.today}T00:00:00Z`) : new Date();
  const controls = db.controls || [];
  const evidence = db.evidence || [];
  const assessedControls = controls.filter((control) => control.lastAssessed);
  const compliantControls = controls.filter((control) => control.status === "compliant");
  const watchControls = controls.filter((control) => control.status === "watch");
  const atRiskControls = controls.filter((control) => control.status === "at_risk");
  const pendingControls = controls.filter((control) => control.status === "pending");

  const risks = controls.map((control) => ({
    id: control.id,
    title: control.title,
    category: control.category,
    status: control.status,
    risk: computeControlRisk(control, today),
    intrusion: computeIntrusionScore(control),
    dueIn: daysUntil(control.dueDate, today),
  }));

  const averageRisk = risks.length
    ? Math.round(risks.reduce((sum, item) => sum + item.risk, 0) / risks.length)
    : 0;
  const averageIntrusion = risks.length
    ? Math.round(risks.reduce((sum, item) => sum + item.intrusion, 0) / risks.length)
    : 0;

  const evidenceDue = evidence.filter((item) => {
    const dueIn = daysUntil(item.nextReview, today);
    return dueIn !== null && dueIn <= 30;
  });

  const alerts = [
    ...risks
      .filter((item) => item.status === "at_risk" || item.risk >= 75)
      .map((item) => ({
        id: `alert-${item.id}-risk`,
        severity: "high",
        title: item.title,
        message: `${STATUS_LABELS[item.status]} control with risk score ${item.risk}.`,
        controlId: item.id,
      })),
    ...risks
      .filter((item) => item.dueIn !== null && item.dueIn <= 14)
      .map((item) => ({
        id: `alert-${item.id}-due`,
        severity: item.dueIn < 0 ? "critical" : "medium",
        title: item.title,
        message: item.dueIn < 0
          ? `Review overdue by ${Math.abs(item.dueIn)} day(s).`
          : `Review due in ${item.dueIn} day(s).`,
        controlId: item.id,
      })),
    ...evidenceDue.map((item) => {
      const dueIn = daysUntil(item.nextReview, today);
      return {
        id: `alert-${item.id}-evidence`,
        severity: dueIn < 0 ? "high" : "low",
        title: item.title,
        message: dueIn < 0
          ? `Evidence review overdue by ${Math.abs(dueIn)} day(s).`
          : `Evidence review due in ${dueIn} day(s).`,
        controlId: item.controlId,
      };
    }),
  ].sort((left, right) => SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity]);

  const sensitiveDataPoints = uniqueList(controls.flatMap((control) => control.requiredData || []));
  const minimizationReady = controls.filter((control) => (
    (control.privacyControls || []).length > 0 && (control.prohibitedCollection || []).length > 0
  ));

  return {
    organization: db.organization,
    summary: {
      totalControls: controls.length,
      assessedControls: assessedControls.length,
      coverage: controls.length ? Math.round((assessedControls.length / controls.length) * 100) : 0,
      compliant: compliantControls.length,
      watch: watchControls.length,
      atRisk: atRiskControls.length,
      pending: pendingControls.length,
      riskScore: averageRisk,
      intrusionIndex: averageIntrusion,
      evidenceDue: evidenceDue.length,
      openActions: watchControls.length + atRiskControls.length + pendingControls.length + evidenceDue.length,
      sensitiveDataPoints: sensitiveDataPoints.length,
      minimizationCoverage: controls.length ? Math.round((minimizationReady.length / controls.length) * 100) : 0,
    },
    risks,
    alerts,
    workforce: db.workforce,
    recentAssessments: (db.assessments || []).slice(0, 6),
    recentAudit: (db.audit || []).slice(0, 6),
  };
}

function findControl(db, controlId) {
  const control = (db.controls || []).find((item) => item.id === controlId);
  if (!control) {
    throw inputError("Control not found");
  }
  return control;
}

function applyAssessment(db, payload) {
  const controlId = normalizeText(payload.controlId);
  const status = normalizeText(payload.status);
  const owner = normalizeText(payload.owner, "Compliance owner");
  const notes = normalizeText(payload.notes);

  if (!controlId) {
    throw inputError("controlId is required");
  }
  if (!VALID_STATUSES.has(status)) {
    throw inputError("status must be compliant, watch, at_risk, or pending");
  }

  const control = findControl(db, controlId);
  const dueDate = assertDateLike(payload.dueDate || control.dueDate, "dueDate");
  const evidenceRefs = Array.isArray(payload.evidenceRefs)
    ? payload.evidenceRefs.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  const assessment = {
    id: makeId("ASM"),
    controlId,
    status,
    owner,
    notes,
    evidenceRefs,
    dueDate,
    createdAt: new Date().toISOString(),
  };

  db.assessments = db.assessments || [];
  db.assessments.unshift(assessment);

  Object.assign(control, {
    status,
    owner,
    dueDate,
    lastAssessed: todayIso(),
    lastNotes: notes,
  });

  recordAudit(db, "assessment.created", `Assessment recorded for ${control.title}`, {
    controlId,
    assessmentId: assessment.id,
    status,
  });

  return assessment;
}

function applyEvidence(db, payload) {
  const title = normalizeText(payload.title);
  const controlId = normalizeText(payload.controlId);
  const type = normalizeText(payload.type, "Document");
  const source = normalizeText(payload.source, "Internal record");
  const retention = normalizeText(payload.retention, "Retain according to configured policy");
  const accessLevel = normalizeText(payload.accessLevel, "Restricted");
  const personalData = normalizeText(payload.personalData, "Minimal");
  const nextReview = assertDateLike(payload.nextReview, "nextReview");

  if (!title) {
    throw inputError("title is required");
  }
  if (!controlId) {
    throw inputError("controlId is required");
  }
  if (!nextReview) {
    throw inputError("nextReview is required");
  }

  findControl(db, controlId);

  const evidence = {
    id: makeId("EVD"),
    title,
    controlId,
    type,
    source,
    retention,
    accessLevel,
    personalData,
    nextReview,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  db.evidence = db.evidence || [];
  db.evidence.unshift(evidence);

  recordAudit(db, "evidence.created", `Evidence added: ${title}`, {
    controlId,
    evidenceId: evidence.id,
  });

  return evidence;
}

function updateEvidence(db, id, payload) {
  const evidence = (db.evidence || []).find((item) => item.id === id);
  if (!evidence) {
    throw inputError("Evidence not found");
  }

  const allowedStatuses = new Set(["active", "reviewed", "retired"]);
  const status = normalizeText(payload.status || evidence.status);
  if (!allowedStatuses.has(status)) {
    throw inputError("status must be active, reviewed, or retired");
  }

  Object.assign(evidence, {
    status,
    nextReview: assertDateLike(payload.nextReview || evidence.nextReview, "nextReview"),
    updatedAt: new Date().toISOString(),
  });

  recordAudit(db, "evidence.updated", `Evidence updated: ${evidence.title}`, {
    evidenceId: evidence.id,
    status,
  });

  return evidence;
}

function recordAudit(db, action, message, meta = {}) {
  db.audit = db.audit || [];
  db.audit.unshift({
    id: makeId("AUD"),
    action,
    message,
    meta,
    actor: "system",
    createdAt: new Date().toISOString(),
  });
}

module.exports = {
  VALID_STATUSES,
  STATUS_LABELS,
  DEFAULT_LABOUR_RULES,
  buildDashboard,
  buildLabourDashboard,
  computeControlRisk,
  computeIntrusionScore,
  calculateWorkHours,
  assessWorkLog,
  applyAssessment,
  applyEvidence,
  applyWorkLog,
  canManageWorkforce,
  updateEvidence,
};
