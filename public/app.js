const state = {
  dashboard: null,
  labour: null,
  controls: [],
  evidence: [],
  audit: [],
  user: null,
  activeView: "overview",
  filters: {
    status: "all",
    search: "",
  },
};

const statusLabels = {
  compliant: "Compliant",
  watch: "Watch",
  at_risk: "At risk",
  pending: "Pending",
};
const managerOnlyViews = new Set(["employees", "reports", "controls", "assess", "evidence"]);

function canManageWorkforce() {
  return String(state.user?.role || "").toLowerCase() !== "employee";
}

const els = {
  apiStatus: document.querySelector("#apiStatus"),
  workspaceEyebrow: document.querySelector("#workspaceEyebrow"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  programOwner: document.querySelector("#programOwner"),
  jurisdictionMode: document.querySelector("#jurisdictionMode"),
  employeeOverviewPanel: document.querySelector("#employeeOverviewPanel"),
  managerOverviewPanel: document.querySelector("#managerOverviewPanel"),
  employeeMetricGrid: document.querySelector("#employeeMetricGrid"),
  employeeWelcome: document.querySelector("#employeeWelcome"),
  employeeRecentLogs: document.querySelector("#employeeRecentLogs"),
  employeePrivacyPosture: document.querySelector("#employeePrivacyPosture"),
  metricGrid: document.querySelector("#metricGrid"),
  labourAlertList: document.querySelector("#labourAlertList"),
  privacyPosture: document.querySelector("#privacyPosture"),
  riskChart: document.querySelector("#riskChart"),
  alertList: document.querySelector("#alertList"),
  departmentGrid: document.querySelector("#departmentGrid"),
  workLogForm: document.querySelector("#workLogForm"),
  workLogEmployee: document.querySelector("#workLogEmployee"),
  workLogEmployeeWrap: document.querySelector("#workLogEmployeeWrap"),
  personalSummary: document.querySelector("#personalSummary"),
  personalWorkLogs: document.querySelector("#personalWorkLogs"),
  employeeTable: document.querySelector("#employeeTable"),
  reportSummary: document.querySelector("#reportSummary"),
  violationList: document.querySelector("#violationList"),
  controlTable: document.querySelector("#controlTable"),
  statusFilter: document.querySelector("#statusFilter"),
  controlSearch: document.querySelector("#controlSearch"),
  assessmentForm: document.querySelector("#assessmentForm"),
  assessmentControl: document.querySelector("#assessmentControl"),
  selectedControlPanel: document.querySelector("#selectedControlPanel"),
  evidenceForm: document.querySelector("#evidenceForm"),
  evidenceControl: document.querySelector("#evidenceControl"),
  evidenceList: document.querySelector("#evidenceList"),
  privacyMatrix: document.querySelector("#privacyMatrix"),
  auditList: document.querySelector("#auditList"),
  refreshBtn: document.querySelector("#refreshBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/session") {
      window.location.href = "/login";
      return null;
    }
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function ensureSession() {
  const session = await api("/api/session");
  if (!session?.authenticated) {
    window.location.href = "/login";
    return false;
  }
  state.user = session.user;
  return true;
}

async function loadAll() {
  setApiStatus("Connecting", "status-muted");
  const signedIn = await ensureSession();
  if (!signedIn) {
    return;
  }

  const labour = await api("/api/labour-dashboard");
  state.labour = labour;

  if (canManageWorkforce()) {
    const [dashboard, controls, evidence, audit] = await Promise.all([
      api("/api/dashboard"),
      api("/api/controls"),
      api("/api/evidence"),
      api("/api/audit"),
    ]);

    state.dashboard = dashboard;
    state.controls = controls.controls;
    state.evidence = evidence.evidence;
    state.audit = audit.audit;
  } else {
    state.dashboard = {
      organization: labour.organization || {},
      summary: {},
      risks: [],
      alerts: [],
      workforce: { departments: [] },
    };
    state.controls = [];
    state.evidence = [];
    state.audit = [];
  }

  setApiStatus("Live", "status-compliant");
  render();
}

function setApiStatus(label, className) {
  els.apiStatus.className = `status-pill ${className}`;
  els.apiStatus.textContent = label;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function render() {
  renderRoleAccess();
  renderShell();
  renderAttendance();
  renderPrivacyMatrix();

  if (canManageWorkforce()) {
    renderMetrics();
    renderLabourAlerts();
    renderPrivacyPosture();
    renderRiskChart();
    renderAlerts();
    renderDepartments();
    renderEmployees();
    renderReports();
    renderControls();
    renderControlSelects();
    renderSelectedControl();
    renderEvidence();
    renderAudit();
  } else {
    renderEmployeeOverview();
  }
}

function renderShell() {
  const org = state.dashboard?.organization || {};
  if (canManageWorkforce()) {
    els.workspaceEyebrow.textContent = "Employer compliance workspace";
    els.workspaceTitle.textContent = "Smart Labour Compliance System";
    els.programOwner.textContent = org.programOwner || "People Operations";
    els.jurisdictionMode.textContent = org.jurisdictionMode || "Configurable by site";
    return;
  }

  els.workspaceEyebrow.textContent = "Employee self-service workspace";
  els.workspaceTitle.textContent = "My Labour Compliance Dashboard";
  els.programOwner.textContent = state.user?.name || "Employee";
  els.jurisdictionMode.textContent = "Personal attendance and wage summary";
}

function renderRoleAccess() {
  const isManager = canManageWorkforce();
  document.body.dataset.workspaceRole = isManager ? "manager" : "employee";

  document.querySelectorAll("[data-manager-only]").forEach((element) => {
    element.hidden = !isManager;
  });

  document.querySelectorAll("[data-employee-label]").forEach((element) => {
    if (!element.dataset.defaultLabel) {
      element.dataset.defaultLabel = element.textContent;
    }
    element.textContent = isManager ? element.dataset.defaultLabel : element.dataset.employeeLabel;
  });

  els.exportBtn.classList.toggle("hidden", !isManager);
  els.managerOverviewPanel.classList.toggle("hidden", !isManager);
  els.employeeOverviewPanel.classList.toggle("hidden", isManager);

  if (!isManager && managerOnlyViews.has(state.activeView)) {
    state.activeView = "overview";
  }
  switchView(state.activeView);
}

function renderMetrics() {
  const summary = state.dashboard.summary;
  const labour = state.labour.summary;
  const metrics = [
    {
      label: "Coverage",
      value: `${summary.coverage}%`,
      detail: `${summary.assessedControls} of ${summary.totalControls} controls assessed`,
    },
    {
      label: "Risk score",
      value: summary.riskScore,
      detail: `${summary.atRisk} at risk, ${summary.watch} on watch`,
    },
    {
      label: "Intrusion index",
      value: summary.intrusionIndex,
      detail: `${summary.minimizationCoverage}% with explicit minimization controls`,
    },
    {
      label: "Work logs",
      value: labour.totalLogs,
      detail: `${labour.totalEmployees} employees, ${labour.averageDailyHours} average hours`,
    },
    {
      label: "Rule alerts",
      value: labour.violationCount,
      detail: `${labour.overtimeIssues} hours alerts, ${labour.wageIssues} wage alerts`,
    },
  ];

  els.metricGrid.innerHTML = metrics.map((metric) => `
    <article class="metric-card">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p>${escapeHtml(metric.detail)}</p>
    </article>
  `).join("");
}

function renderLabourAlerts() {
  const violations = state.labour.violationLogs.slice(0, 6);
  if (!violations.length) {
    els.labourAlertList.innerHTML = `<div class="empty-state">No work-hour or wage violations in the current log set.</div>`;
    return;
  }

  els.labourAlertList.innerHTML = violations.map((log) => `
    <article class="alert high">
      <strong>${escapeHtml(log.employeeName)} - ${formatDate(log.date)}</strong>
      <p>${escapeHtml(log.compliance.issues.map((issue) => issue.message).join(" "))}</p>
      <span class="subtle">${log.totalHours} hours, ${log.overtimeHours} overtime, ${formatMoney(log.wagePaid)} paid</span>
    </article>
  `).join("");
}

function renderPrivacyPosture() {
  const posture = state.labour.privacyPosture;
  renderPrivacyPostureInto(els.privacyPosture, posture);
}

function renderPrivacyPostureInto(target, posture) {
  target.innerHTML = `
    <div class="privacy-columns compact-columns">
      <div class="privacy-column">
        <span>Collect</span>
        ${simpleList(posture.collected)}
      </div>
      <div class="privacy-column">
        <span>Avoid</span>
        ${simpleList(posture.avoided)}
      </div>
    </div>
    <p class="subtle">${escapeHtml(posture.retention)}</p>
  `;
}

function renderEmployeeOverview() {
  const summary = state.labour.personalSummary || {};
  const recentLogs = summary.recentLogs || [];
  const cards = [
    {
      label: "My hours",
      value: summary.totalHours || 0,
      detail: `${summary.logCount || 0} work log(s) submitted`,
    },
    {
      label: "Average day",
      value: summary.averageHours || 0,
      detail: "Calculated from my submitted logs",
    },
    {
      label: "My wages",
      value: formatMoney(summary.totalWages || 0),
      detail: `${formatMoney(summary.hourlyRate || 0)} hourly profile rate`,
    },
    {
      label: "My alerts",
      value: summary.violationCount || 0,
      detail: `${summary.overtimeIssues || 0} hours, ${summary.minimumWageIssues || 0} wage`,
    },
  ];

  els.employeeWelcome.textContent = `Welcome, ${state.user?.name || "employee"}`;
  els.employeeMetricGrid.innerHTML = cards.map((metric) => `
    <article class="metric-card">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p>${escapeHtml(metric.detail)}</p>
    </article>
  `).join("");

  renderWorkLogList(els.employeeRecentLogs, recentLogs, "You have not submitted any work logs yet.");
  renderPrivacyPostureInto(els.employeePrivacyPosture, state.labour.privacyPosture);
}

function renderAttendance() {
  const employees = state.labour.employees || [];
  const canManage = canManageWorkforce();
  els.workLogEmployeeWrap.classList.toggle("hidden", !canManage);
  els.workLogEmployee.innerHTML = employees.map((employee) => `
    <option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} - ${escapeHtml(employee.department)}</option>
  `).join("");

  if (els.workLogForm.elements.date && !els.workLogForm.elements.date.value) {
    els.workLogForm.elements.date.value = new Date().toISOString().slice(0, 10);
  }

  const labourSummary = state.labour.summary;
  const personalSummary = state.labour.personalSummary;
  const cards = canManage ? [
    ["Employees", labourSummary.totalEmployees],
    ["Logged hours", labourSummary.totalHours],
    ["Rule alerts", labourSummary.violationCount],
    ["Compliant logs", labourSummary.compliantLogs],
  ] : [
    ["Logged hours", personalSummary?.totalHours || 0],
    ["Average day", personalSummary?.averageHours || 0],
    ["Rule alerts", personalSummary?.violationCount || 0],
    ["Wages", formatMoney(personalSummary?.totalWages || 0)],
  ];

  els.personalSummary.innerHTML = cards.map(([label, value]) => `
    <article class="mini-summary">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");

  const logs = canManage
    ? state.labour.workLogs.slice(0, 8)
    : (personalSummary?.recentLogs || []);
  renderWorkLogList(els.personalWorkLogs, logs, "No work logs recorded yet.");
}

function renderEmployees() {
  const records = state.labour.employeeRecords || [];
  if (!records.length) {
    els.employeeTable.innerHTML = `
      <tr>
        <td colspan="7"><div class="empty-state">No employee records available.</div></td>
      </tr>
    `;
    return;
  }

  els.employeeTable.innerHTML = records.map((employee) => `
    <tr>
      <td>
        <div class="control-title">
          <strong>${escapeHtml(employee.name)}</strong>
          <span>${escapeHtml(employee.email)} - ${escapeHtml(employee.site)}</span>
        </div>
      </td>
      <td>${escapeHtml(employee.department)}</td>
      <td>${employee.totalHours}</td>
      <td>${employee.averageHours}</td>
      <td>${formatMoney(employee.totalWages)}</td>
      <td><span class="status-pill status-${employee.status}">${escapeHtml(statusLabels[employee.status])}</span></td>
      <td>
        <span class="tag ${employee.overtimeIssues ? "warn" : ""}">${employee.overtimeIssues} hours</span>
        <span class="tag ${employee.minimumWageIssues ? "warn" : ""}">${employee.minimumWageIssues} wage</span>
      </td>
    </tr>
  `).join("");
}

function renderReports() {
  const summary = state.labour.summary;
  const rules = state.labour.rules;
  const reportCards = [
    ["Daily limit", `${rules.dailyHoursLimit}h`],
    ["Weekly limit", `${rules.weeklyHoursLimit}h`],
    ["Minimum wage", formatMoney(rules.minimumHourlyWage)],
    ["Total violations", summary.violationCount],
  ];

  els.reportSummary.innerHTML = reportCards.map(([label, value]) => `
    <article class="mini-summary">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");

  renderWorkLogList(els.violationList, state.labour.violationLogs, "No violation logs for the current scope.");
}

function renderWorkLogList(target, logs, emptyMessage) {
  if (!logs.length) {
    target.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  target.innerHTML = logs.map((log) => {
    const issues = log.compliance.issues.length
      ? log.compliance.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")
      : "<li>No rule violations detected.</li>";

    return `
      <article class="worklog-card">
        <header>
          <div>
            <strong>${escapeHtml(log.employeeName)} - ${formatDate(log.date)}</strong>
            <p>${escapeHtml(log.startTime)} to ${escapeHtml(log.endTime)} at ${escapeHtml(log.site)}</p>
          </div>
          <span class="status-pill status-${log.compliance.status}">${escapeHtml(statusLabels[log.compliance.status])}</span>
        </header>
        <div class="evidence-meta">
          <span class="tag">${log.totalHours} hours</span>
          <span class="tag warn">${log.overtimeHours} overtime</span>
          <span class="tag">${formatMoney(log.wagePaid)}</span>
          <span class="tag">${formatMoney(log.compliance.effectiveHourlyWage)}/hr</span>
        </div>
        <ul class="issue-list">${issues}</ul>
      </article>
    `;
  }).join("");
}

function renderRiskChart() {
  const risks = [...state.dashboard.risks].sort((a, b) => b.risk - a.risk);
  els.riskChart.innerHTML = risks.map((item) => {
    const tone = item.risk >= 70 ? "risk-high" : item.risk >= 45 ? "risk-medium" : "risk-low";
    return `
      <div class="risk-row">
        <strong>${escapeHtml(item.id)}</strong>
        <div class="bar-track" aria-label="${escapeHtml(item.title)} risk ${item.risk}">
          <div class="bar-fill ${tone}" style="width: ${item.risk}%"></div>
        </div>
        <span class="status-pill status-${item.status}">${item.risk}</span>
      </div>
    `;
  }).join("");
}

function renderAlerts() {
  const alerts = state.dashboard.alerts.slice(0, 8);
  if (!alerts.length) {
    els.alertList.innerHTML = `<div class="empty-state">No active alerts.</div>`;
    return;
  }

  els.alertList.innerHTML = alerts.map((alert) => `
    <article class="alert ${escapeHtml(alert.severity)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <p>${escapeHtml(alert.message)}</p>
      <span class="subtle">${escapeHtml(alert.controlId)}</span>
    </article>
  `).join("");
}

function renderDepartments() {
  const departments = state.dashboard.workforce.departments || [];
  els.departmentGrid.innerHTML = departments.map((department) => `
    <article class="department-card">
      <span class="status-pill status-${department.risk}">${escapeHtml(statusLabels[department.risk] || department.risk)}</span>
      <strong>${escapeHtml(department.name)}</strong>
      <p>${department.count} workers in scope</p>
    </article>
  `).join("");
}

function renderControls() {
  const search = state.filters.search.toLowerCase();
  const controls = state.controls.filter((control) => {
    const matchesStatus = state.filters.status === "all" || control.status === state.filters.status;
    const haystack = `${control.id} ${control.title} ${control.category} ${control.owner}`.toLowerCase();
    return matchesStatus && haystack.includes(search);
  });

  if (!controls.length) {
    els.controlTable.innerHTML = `
      <tr>
        <td colspan="7"><div class="empty-state">No controls match the current filters.</div></td>
      </tr>
    `;
    return;
  }

  els.controlTable.innerHTML = controls.map((control) => `
    <tr>
      <td>
        <div class="control-title">
          <strong>${escapeHtml(control.title)}</strong>
          <span>${escapeHtml(control.id)} - ${escapeHtml(control.lastNotes || "No notes recorded")}</span>
        </div>
      </td>
      <td>${escapeHtml(control.category)}</td>
      <td><span class="status-pill status-${control.status}">${escapeHtml(statusLabels[control.status])}</span></td>
      <td>${escapeHtml(control.owner)}</td>
      <td>${formatDate(control.dueDate)}</td>
      <td>
        <span class="tag">${control.requiredData.length} data fields</span>
        <span class="tag warn">${control.prohibitedCollection.length} avoided</span>
      </td>
      <td>
        <button class="button ghost" type="button" data-assess="${escapeHtml(control.id)}">Assess</button>
      </td>
    </tr>
  `).join("");
}

function renderControlSelects() {
  const currentAssessmentControl = els.assessmentControl.value;
  const currentEvidenceControl = els.evidenceControl.value;
  const options = state.controls.map((control) => `
    <option value="${escapeHtml(control.id)}">${escapeHtml(control.id)} - ${escapeHtml(control.title)}</option>
  `).join("");
  els.assessmentControl.innerHTML = options;
  els.evidenceControl.innerHTML = options;

  if (state.controls.some((control) => control.id === currentAssessmentControl)) {
    els.assessmentControl.value = currentAssessmentControl;
  }

  if (state.controls.some((control) => control.id === currentEvidenceControl)) {
    els.evidenceControl.value = currentEvidenceControl;
  }

  const selectedControl = getSelectedControl();
  if (selectedControl) {
    els.assessmentForm.elements.status.value = selectedControl.status;
    els.assessmentForm.elements.owner.value = selectedControl.owner;
    els.assessmentForm.elements.dueDate.value = selectedControl.dueDate;
    els.assessmentForm.elements.notes.value = selectedControl.lastNotes || "";
  }
}

function getSelectedControl() {
  const selectedId = els.assessmentControl.value || state.controls[0]?.id;
  return state.controls.find((control) => control.id === selectedId);
}

function renderSelectedControl() {
  const control = getSelectedControl();
  if (!control) {
    els.selectedControlPanel.innerHTML = `<div class="empty-state">Select a control.</div>`;
    return;
  }

  els.selectedControlPanel.innerHTML = `
    <article class="selected-control-block">
      <div>
        <h3>${escapeHtml(control.title)}</h3>
        <span class="status-pill status-${control.status}">${escapeHtml(statusLabels[control.status])}</span>
      </div>
      ${listBlock("Required data", control.requiredData)}
      ${listBlock("Avoid collecting", control.prohibitedCollection, "warn")}
      ${listBlock("Privacy controls", control.privacyControls)}
      ${listBlock("Evidence needed", control.evidenceNeeded)}
    </article>
  `;
}

function listBlock(title, items, tone = "") {
  return `
    <div>
      <span class="panel-label">${escapeHtml(title)}</span>
      <div class="tag-list">
        ${items.map((item) => `<span class="tag ${tone}">${escapeHtml(item)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderEvidence() {
  if (!state.evidence.length) {
    els.evidenceList.innerHTML = `<div class="empty-state">No evidence recorded.</div>`;
    return;
  }

  els.evidenceList.innerHTML = state.evidence.map((item) => {
    const control = state.controls.find((entry) => entry.id === item.controlId);
    return `
      <article class="evidence-card">
        <header>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(control?.title || item.controlId)}</p>
          </div>
          <span class="status-pill status-${item.status === "reviewed" ? "compliant" : "watch"}">${escapeHtml(item.status)}</span>
        </header>
        <div class="evidence-meta">
          <span class="tag">${escapeHtml(item.type)}</span>
          <span class="tag">${escapeHtml(item.accessLevel)}</span>
          <span class="tag warn">${escapeHtml(item.personalData)}</span>
        </div>
        <p>${escapeHtml(item.retention)}</p>
        <div class="evidence-meta">
          <span class="subtle">Review ${formatDate(item.nextReview)}</span>
          <button class="button ghost" type="button" data-review="${escapeHtml(item.id)}">Mark Reviewed</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderPrivacyMatrix() {
  if (!canManageWorkforce()) {
    const posture = state.labour.privacyPosture;
    els.privacyMatrix.innerHTML = `
      <article class="privacy-card">
        <header>
          <div>
            <strong>My data collected by SLCS</strong>
            <p>Employee self-service only stores the fields needed to check work-hour, overtime, and wage rules.</p>
          </div>
          <span class="status-pill status-compliant">Reduced</span>
        </header>
        <div class="privacy-columns compact-columns">
          <div class="privacy-column">
            <span>Collected</span>
            ${simpleList(posture.collected)}
          </div>
          <div class="privacy-column">
            <span>Not collected</span>
            ${simpleList(posture.avoided)}
          </div>
        </div>
      </article>
    `;
    els.auditList.innerHTML = `
      <article class="audit-item">
        <strong>Employee privacy boundary</strong>
        <p>You can view and submit your own attendance records. Employer-only compliance evidence, control assessments, and workforce reports are not shown in this dashboard.</p>
      </article>
    `;
    return;
  }

  els.privacyMatrix.innerHTML = state.controls.map((control) => `
    <article class="privacy-card">
      <header>
        <div>
          <strong>${escapeHtml(control.title)}</strong>
          <p>${escapeHtml(control.category)} - sensitivity ${control.dataSensitivity}/5</p>
        </div>
        <span class="status-pill status-${control.status}">${escapeHtml(statusLabels[control.status])}</span>
      </header>
      <div class="privacy-columns">
        <div class="privacy-column">
          <span>Collect</span>
          ${simpleList(control.requiredData)}
        </div>
        <div class="privacy-column">
          <span>Avoid</span>
          ${simpleList(control.prohibitedCollection)}
        </div>
        <div class="privacy-column">
          <span>Safeguards</span>
          ${simpleList(control.privacyControls)}
        </div>
      </div>
    </article>
  `).join("");
}

function simpleList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderAudit() {
  if (!state.audit.length) {
    els.auditList.innerHTML = `<div class="empty-state">No audit entries.</div>`;
    return;
  }

  els.auditList.innerHTML = state.audit.map((item) => `
    <article class="audit-item">
      <strong>${escapeHtml(item.message)}</strong>
      <p>${escapeHtml(item.action)} - ${formatDateTime(item.createdAt)}</p>
    </article>
  `).join("");
}

function switchView(viewId) {
  if (!canManageWorkforce() && managerOnlyViews.has(viewId)) {
    viewId = "overview";
  }

  state.activeView = viewId;
  document.querySelectorAll(".view").forEach((view) => {
    const unavailable = !canManageWorkforce() && managerOnlyViews.has(view.id);
    view.hidden = unavailable;
    view.classList.toggle("active", !unavailable && view.id === viewId);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", !item.hidden && item.dataset.view === viewId);
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });

  document.querySelectorAll("[data-view-jump]").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.viewJump));
  });

  els.refreshBtn.addEventListener("click", () => {
    loadAll().then(() => showToast("Workspace refreshed")).catch(handleError);
  });

  els.exportBtn.addEventListener("click", exportPack);

  els.logoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST", body: "{}" });
      window.location.href = "/login";
    } catch (error) {
      handleError(error);
    }
  });

  els.statusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderControls();
  });

  els.workLogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(els.workLogForm).entries());

    try {
      await api("/api/work-logs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      els.workLogForm.reset();
      await loadAll();
      switchView("attendance");
      showToast("Work log saved and checked");
    } catch (error) {
      handleError(error);
    }
  });

  els.controlSearch.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderControls();
  });

  els.controlTable.addEventListener("click", (event) => {
    const button = event.target.closest("[data-assess]");
    if (!button) {
      return;
    }
    switchView("assess");
    els.assessmentControl.value = button.dataset.assess;
    renderControlSelects();
    renderSelectedControl();
  });

  els.assessmentControl.addEventListener("change", () => {
    renderControlSelects();
    renderSelectedControl();
  });

  els.assessmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(els.assessmentForm);
    const payload = Object.fromEntries(form.entries());
    payload.evidenceRefs = payload.evidenceRefs
      ? payload.evidenceRefs.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

    try {
      await api("/api/assessments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadAll();
      showToast("Assessment saved");
    } catch (error) {
      handleError(error);
    }
  });

  els.evidenceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(els.evidenceForm).entries());

    try {
      await api("/api/evidence", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      els.evidenceForm.reset();
      await loadAll();
      showToast("Evidence added");
    } catch (error) {
      handleError(error);
    }
  });

  els.evidenceList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-review]");
    if (!button) {
      return;
    }

    const item = state.evidence.find((entry) => entry.id === button.dataset.review);
    if (!item) {
      return;
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 90);

    try {
      await api(`/api/evidence/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "reviewed",
          nextReview: nextReview.toISOString().slice(0, 10),
        }),
      });
      await loadAll();
      showToast("Evidence marked reviewed");
    } catch (error) {
      handleError(error);
    }
  });
}

function exportPack() {
  const pack = {
    exportedAt: new Date().toISOString(),
    organization: state.dashboard.organization,
    summary: state.dashboard.summary,
    labour: state.labour,
    controls: state.controls,
    evidence: state.evidence,
    audit: state.audit,
  };
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `labour-compliance-pack-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Audit pack exported");
}

function handleError(error) {
  setApiStatus("Attention", "status-at_risk");
  showToast(error.message || "Something went wrong");
}

bindEvents();
loadAll().catch(handleError);
