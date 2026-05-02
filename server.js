const http = require("http");
const path = require("path");
const fs = require("fs/promises");
const {
  buildDashboard,
  buildLabourDashboard,
  applyAssessment,
  applyEvidence,
  applyWorkLog,
  updateEvidence,
} = require("./src/complianceEngine");
const { readDb, writeDb, ensureDb } = require("./src/storage");
const {
  authenticateUser,
  createUser,
  createSession,
  getSession,
  requireSession,
  clearSession,
  sessionCookie,
  clearSessionCookie,
} = require("./src/auth");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, "public");
const MAX_BODY_BYTES = 1_000_000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}

function sendJsonWithHeaders(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : error.message;
  if (statusCode === 500) {
    console.error(error);
  }
  sendJson(res, statusCode, { error: message });
}

function notFound(res) {
  sendJson(res, 404, { error: "Route not found" });
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let received = 0;

    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });

    req.on("error", reject);

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error("Request body must be valid JSON");
        error.statusCode = 400;
        reject(error);
      }
    });
  });
}

function routeMatch(pathname, pattern) {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];

    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }

    if (expected !== actual) {
      return null;
    }
  }

  return params;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "Labour Law Compliance API",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/session") {
    const session = getSession(req);
    sendJson(res, 200, { authenticated: Boolean(session), user: session?.user || null });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const payload = await parseJsonBody(req);
    const db = await readDb();
    const user = authenticateUser(db, payload.email, payload.password);
    const session = createSession(user);
    sendJsonWithHeaders(res, 200, { authenticated: true, user }, {
      "Set-Cookie": sessionCookie(session.sessionId, session.expiresAt),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/signup") {
    const payload = await parseJsonBody(req);
    const db = await readDb();
    const user = createUser(db, payload);
    await writeDb(db);
    const session = createSession(user);
    sendJsonWithHeaders(res, 201, { authenticated: true, user }, {
      "Set-Cookie": sessionCookie(session.sessionId, session.expiresAt),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    clearSession(req);
    sendJsonWithHeaders(res, 200, { authenticated: false }, {
      "Set-Cookie": clearSessionCookie(),
    });
    return;
  }

  const session = requireSession(req);

  if (req.method === "GET" && pathname === "/api/dashboard") {
    const db = await readDb();
    sendJson(res, 200, buildDashboard(db));
    return;
  }

  if (req.method === "GET" && pathname === "/api/labour-dashboard") {
    const db = await readDb();
    sendJson(res, 200, buildLabourDashboard(db, { viewer: session.user }));
    return;
  }

  if (req.method === "GET" && pathname === "/api/employees") {
    const db = await readDb();
    const labourDashboard = buildLabourDashboard(db, { viewer: session.user });
    sendJson(res, 200, { employees: labourDashboard.employeeRecords });
    return;
  }

  if (req.method === "GET" && pathname === "/api/work-logs") {
    const db = await readDb();
    const labourDashboard = buildLabourDashboard(db, { viewer: session.user });
    sendJson(res, 200, { workLogs: labourDashboard.workLogs });
    return;
  }

  if (req.method === "POST" && pathname === "/api/work-logs") {
    const payload = await parseJsonBody(req);
    const db = await readDb();
    const workLog = applyWorkLog(db, payload, session.user);
    await writeDb(db);
    sendJson(res, 201, {
      workLog,
      labourDashboard: buildLabourDashboard(db, { viewer: session.user }),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/controls") {
    const db = await readDb();
    sendJson(res, 200, { controls: db.controls });
    return;
  }

  if (req.method === "GET" && pathname === "/api/evidence") {
    const db = await readDb();
    sendJson(res, 200, { evidence: db.evidence });
    return;
  }

  if (req.method === "GET" && pathname === "/api/assessments") {
    const db = await readDb();
    sendJson(res, 200, { assessments: db.assessments });
    return;
  }

  if (req.method === "GET" && pathname === "/api/audit") {
    const db = await readDb();
    sendJson(res, 200, { audit: db.audit.slice(0, 50) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/assessments") {
    const payload = await parseJsonBody(req);
    const db = await readDb();
    const assessment = applyAssessment(db, payload);
    await writeDb(db);
    sendJson(res, 201, { assessment, dashboard: buildDashboard(db) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/evidence") {
    const payload = await parseJsonBody(req);
    const db = await readDb();
    const evidence = applyEvidence(db, payload);
    await writeDb(db);
    sendJson(res, 201, { evidence, dashboard: buildDashboard(db) });
    return;
  }

  const evidenceParams = routeMatch(pathname, "/api/evidence/:id");
  if (req.method === "PATCH" && evidenceParams) {
    const payload = await parseJsonBody(req);
    const db = await readDb();
    const evidence = updateEvidence(db, evidenceParams.id, payload);
    await writeDb(db);
    sendJson(res, 200, { evidence, dashboard: buildDashboard(db) });
    return;
  }

  notFound(res);
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/app" || pathname === "/app/") {
    if (!getSession(req)) {
      redirect(res, "/login");
      return;
    }
    pathname = "/dashboard.html";
  }

  if (pathname === "/login" || pathname === "/login/") {
    if (getSession(req)) {
      redirect(res, "/app");
      return;
    }
    pathname = "/login.html";
  }

  if (pathname === "/dashboard.html" && !getSession(req)) {
    redirect(res, "/login");
    return;
  }

  const requested = pathname === "/" ? "/index.html" : pathname;
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requested);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const resolvedPath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);
  if (!resolvedPath.startsWith(`${PUBLIC_DIR}${path.sep}`) && resolvedPath !== PUBLIC_DIR) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      notFound(res);
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, error);
  }
});

ensureDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Labour Law Compliance app running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to prepare application data", error);
    process.exit(1);
  });
