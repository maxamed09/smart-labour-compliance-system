const crypto = require("crypto");

const SESSION_COOKIE = "lc_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_SESSION_SECRET = "slcs-local-demo-session-secret";

function inputError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }
      const key = pair.slice(0, separatorIndex);
      const value = pair.slice(separatorIndex + 1);
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSecret() {
  return process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET;
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSessionPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSessionPayload(payload) {
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function makeUserId() {
  if (crypto.randomUUID) {
    return `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `USR-${Date.now().toString(36).toUpperCase()}`;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function authenticateUser(db, email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = (db.users || []).find((entry) => entry.email.toLowerCase() === normalizedEmail);

  if (!user || !password) {
    throw inputError("Invalid email or password", 401);
  }

  const candidateHash = hashPassword(password, user.passwordSalt);
  if (!safeEqual(candidateHash, user.passwordHash)) {
    throw inputError("Invalid email or password", 401);
  }

  return publicUser(user);
}

function createUser(db, payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || "");
  const requestedRole = String(payload.role || "employee").trim().toLowerCase();
  const role = requestedRole === "employer" ? "employer" : "employee";

  if (!name) {
    throw inputError("Name is required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw inputError("A valid email is required");
  }
  if (password.length < 8) {
    throw inputError("Password must be at least 8 characters");
  }
  if (!confirmPassword) {
    throw inputError("Confirm password is required");
  }
  if (confirmPassword && password !== confirmPassword) {
    throw inputError("Passwords do not match");
  }

  db.users = db.users || [];
  if (db.users.some((entry) => entry.email.toLowerCase() === email)) {
    throw inputError("An account already exists for this email", 409);
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: makeUserId(),
    name,
    email,
    role,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    profile: role === "employee"
      ? {
        department: "Unassigned",
        site: "Primary site",
        hourlyRate: 178,
        minimumHourlyWage: 178,
      }
      : {
        department: "People Operations",
        site: "All sites",
      },
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  return publicUser(user);
}

function createSession(user) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = encodeSessionPayload({ user: publicUser(user), expiresAt });
  const sessionId = `${payload}.${signSessionPayload(payload)}`;
  return { sessionId, expiresAt };
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }

  const [payload, signature] = sessionId.split(".");
  if (!payload || !signature || !safeEqual(signature, signSessionPayload(payload))) {
    return null;
  }

  let session;
  try {
    session = decodeSessionPayload(payload);
  } catch {
    return null;
  }

  if (!session.user || !session.expiresAt || session.expiresAt < Date.now()) {
    return null;
  }

  return { id: sessionId, ...session };
}

function requireSession(req) {
  const session = getSession(req);
  if (!session) {
    throw inputError("Authentication required", 401);
  }
  return session;
}

function clearSession(req) {
  getSession(req);
}

function secureCookieAttributes() {
  if (process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production") {
    return "SameSite=None; Secure";
  }

  return "SameSite=Lax";
}

function sessionCookie(sessionId, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; ${secureCookieAttributes()}; Expires=${expires}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${secureCookieAttributes()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

module.exports = {
  SESSION_COOKIE,
  authenticateUser,
  createUser,
  createSession,
  getSession,
  requireSession,
  clearSession,
  sessionCookie,
  clearSessionCookie,
  hashPassword,
};
