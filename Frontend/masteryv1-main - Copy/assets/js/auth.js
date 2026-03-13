/**
 * Auth Manager
 * Handles login, session management, and redirection.
 */

const AUTH_KEY = "ems_session";

class Auth {
  static async login(username, password, role, metadata = {}) {
    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Backend usually wraps in `data: { user, token }`
        const userObj = data.data ? data.data.user : data.user;
        const tokenStr = data.data ? data.data.token : data.token;

        // Merge any frontend-specific metadata with session data if necessary
        const session = { ...userObj, ...metadata };
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        if (tokenStr) {
          localStorage.setItem('college_exam_portal_token', tokenStr);
        }
        return { success: true };
      } else {
        return { success: false, message: data.error?.message || data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return { success: false, message: 'Cannot connect to backend server. Please ensure you have run "node server.js" in the terminal.' };
      }
      return { success: false, message: 'Server error during login. Please try again later.' };
    }
  }

  static logout() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "../index.html";
  }

  static checkSession() {
    const sessionStr = localStorage.getItem(AUTH_KEY);
    if (!sessionStr) return null;
    const session = JSON.parse(sessionStr);
    if (session.role) {
      session.role = session.role.toLowerCase();
    }
    return session;
  }

  static requireRole(role) {
    const session = this.checkSession();
    if (!session || session.role !== role) {
      // Redirect to login if invalid
      // Handle relative paths - for local development, we might be in a subdir
      // We'll rely on relative navigation usually, but for security redirects:
      const path = window.location.pathname;
      if (
        !path.includes("index.html") &&
        path !== "/" &&
        !path.endsWith("vignan/")
      ) {
        window.location.href = "../index.html";
      }
      return false;
    }
    return session;
  }
}

// Global Login Handler (used by index.html)
async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const role = window.currentRole || "student";
  let metadata = {};

  if (role === "student") {
    const sectionEl = document.getElementById("loginSection");
    const branchEl = document.getElementById("loginBranch");
    if (sectionEl) metadata.section = sectionEl.value.trim();
    if (branchEl) metadata.branch = branchEl.value;
    const batchEl = document.getElementById('loginBatch');
    if (batchEl) metadata.batch = batchEl.value;
  }

  // Pass metadata to login
  const result = await Auth.login(username, password, role, metadata);

  if (result.success) {
    if (role === "admin") {
      window.location.href = "admin/index.html";
    } else {
      window.location.href = "student/index.html";
    }
  } else {
    alert(result.message);
    // Clear inputs on failure
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
  }
}

// Expose to window for global access
window.Auth = Auth;
