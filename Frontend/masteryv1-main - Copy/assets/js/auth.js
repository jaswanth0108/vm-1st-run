/**
 * Auth Manager
 * Handles login, session management, and redirection.
 */

const AUTH_KEY = "ems_session";

class Auth {
  static async login(username, password, role, metadata = {}) {
    try {
      const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });

      // Guard: if server returns HTML (error page) instead of JSON, handle gracefully
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.error('Non-JSON response from server. Status:', response.status);
        return {
          success: false,
          message: `Server is unavailable (status ${response.status}). The server may be starting up — please wait 30 seconds and try again.`
        };
      }

      const data = await response.json();

      if (response.ok && data.success) {
        const userObj = data.session || data.user || (data.data ? data.data.user : null);
        const tokenStr = data.token || (data.data ? data.data.token : null);

        if (!userObj) {
          return { success: false, message: 'Login succeeded but no session data was returned. Please contact administrator.' };
        }

        const session = { ...metadata, ...userObj };
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        if (tokenStr) {
          localStorage.setItem('college_exam_portal_token', tokenStr);
        }
        return { success: true };
      } else {
        let errMsg = 'Login failed. Please check your credentials.';
        if (data.message && typeof data.message === 'string') errMsg = data.message;
        else if (data.error && typeof data.error === 'string') errMsg = data.error;
        else if (data.error && data.error.message) errMsg = data.error.message;
        return { success: false, message: errMsg };
      }
    } catch (error) {
      console.error('Login error:', error);
      // Network failure — server completely unreachable
      if (error instanceof TypeError) {
        return { success: false, message: 'Cannot connect to the server. Please check your internet connection and try again.' };
      }
      // JSON parse error — server returned non-JSON (e.g. startup HTML page)
      if (error instanceof SyntaxError) {
        return { success: false, message: 'Server is starting up. Please wait 30–60 seconds and try again.' };
      }
      return { success: false, message: `Login error: ${error.message}. Please try again.` };
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
      // If invalid or no session, redirect based on current path
      const path = window.location.pathname;
      
      // If we are already on the main login page, don't redirect to avoid infinite loops
      if (path.endsWith("index.html") && !path.includes("/admin/") && !path.includes("/student/") || path === "/" || path.endsWith("vignan/")) {
        return false;
      }
      
      // If we are in a protected route (e.g. /admin/index.html), redirect to main login
      if (path.includes("/admin/") || path.includes("/student/")) {
        window.location.href = "../index.html";
      } else {
        window.location.href = "index.html";
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
    const errMsg = result.message || 'Invalid username or password. Please check your details and try again.';
    alert(errMsg);
    // Clear inputs on failure
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
  }
}

// Expose to window for global access
window.Auth = Auth;
