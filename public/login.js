const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const loginMessage = document.querySelector("#loginMessage");
const signupForm = document.querySelector("#signupForm");
const signupButton = document.querySelector("#signupButton");
const signupMessage = document.querySelector("#signupMessage");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const authPanels = document.querySelectorAll("[data-auth-panel]");

function setAuthMode(mode) {
  authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authMode === mode);
  });
  authPanels.forEach((panel) => {
    const isActive = panel.dataset.authPanel === mode;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
  setMessage("");
  setSignupMessage("");
}

async function checkExistingSession() {
  const response = await fetch("/api/session", { credentials: "same-origin" });
  const session = await response.json();
  if (session.authenticated) {
    window.location.href = "/app";
  }
}

function setMessage(message, tone = "muted") {
  loginMessage.textContent = message;
  loginMessage.dataset.tone = tone;
}

function setSignupMessage(message, tone = "muted") {
  signupMessage.textContent = message;
  signupMessage.dataset.tone = tone;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return { error: "Server returned an unreadable response" };
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "Signing in";
  setMessage("Checking credentials...");

  try {
    const payload = Object.fromEntries(new FormData(loginForm).entries());
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(result.error || "Login failed");
    }

    setMessage("Login successful. Opening dashboard.", "success");
    window.location.href = "/app";
  } catch (error) {
    setMessage(error.message || "Login failed", "error");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Log In";
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  signupButton.disabled = true;
  signupButton.textContent = "Creating";
  setSignupMessage("Creating account...");

  try {
    const payload = Object.fromEntries(new FormData(signupForm).entries());
    if (payload.password !== payload.confirmPassword) {
      throw new Error("Passwords do not match");
    }

    const response = await fetch("/api/signup", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await readJsonResponse(response);

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error("This email already has an account. Log in or use a different email.");
      }
      if (response.status >= 500) {
        throw new Error("Registration could not be saved. Refresh the page and try again.");
      }
      throw new Error(result.error || "Signup failed");
    }

    setSignupMessage("Account created. Opening dashboard.", "success");
    window.location.href = "/app";
  } catch (error) {
    setSignupMessage(error.message || "Signup failed", "error");
  } finally {
    signupButton.disabled = false;
    signupButton.textContent = "Create Account";
  }
});

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
});

checkExistingSession().catch(() => {
  setMessage("");
  setSignupMessage("");
});
