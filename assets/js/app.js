/**
 * Main App Script - API-Only Version
 * All data is fetched from the backend. No localStorage data caching.
 * Note: Auth token (college_exam_portal_token) and session (ems_session) are still stored
 * in localStorage by auth.js — this is necessary for the JWT auth flow to work.
 */

// Helper to get the Bearer token for all API calls
function getAuthToken() {
    return localStorage.getItem('college_exam_portal_token') || '';
}

class ExamService {
    // --- Exams ---
    static async getExams() {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`${response.status}: ${errData.message || errData.error || 'Failed to fetch exams'}`);
        }
        const data = await response.json();
        // Server returns an array directly
        return Array.isArray(data) ? data : (data.data || []);
    }

    static async getExamById(id) {
        // Server has no individual exam GET endpoint — fetch all and filter client-side
        const exams = await this.getExams();
        const exam = exams.find(e => String(e.id) === String(id));
        if (!exam) throw new Error(`Exam with ID "${id}" not found`);
        return exam;
    }

    static async saveExam(exam) {
        // Server uses POST /api/exams for both create and update (upsert by ID)
        const payload = {
            ...exam,
            start_time: exam.startTime || new Date().toISOString(),
            end_time: exam.endTime || new Date(Date.now() + (exam.duration || 60) * 60000).toISOString()
        };

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error || 'Failed to sync exam to server');
        }

        return data.exam || data.data || data;
    }

    static async deleteExam(id) {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to delete exam');
        return true;
    }

    // updateExamStatus — server has no PATCH /status endpoint,
    // so we fetch the exam, update status, and save it back via POST
    static async updateExamStatus(id, status) {
        const exam = await this.getExamById(id);
        exam.status = status;
        return await this.saveExam(exam);
    }

    // --- Results ---
    static async submitResult(result) {
        // Server endpoint: POST /api/results
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/results`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(result)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error || 'Failed to submit exam');
        }

        return data;
    }

    static async getResults() {
        // Server endpoint: GET /api/results
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/results`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to fetch results');
        const data = await response.json();
        // Server returns an array directly
        return Array.isArray(data) ? data : (data.data || []);
    }

    static async getStudentResults(studentId) {
        const results = await this.getResults();
        return results.filter(r => String(r.studentId) === String(studentId));
    }

    // --- Helpers ---
    static generateId() {
        return 'exam_' + Math.random().toString(36).substr(2, 9);
    }
}

window.ExamService = ExamService;

// --- User Service ---
class UserService {
    static async getUsers() {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        const result = await response.json();

        // Server returns an object keyed by student ID: { "22A91A0101": { id, name, password, ... }, ... }
        // If it's already an object, return it directly. If it's an array, convert to keyed object.
        if (Array.isArray(result)) {
            const dbUsers = {};
            result.forEach(u => {
                const key = (u.username || u.id || '').toUpperCase();
                if (key) dbUsers[key] = { ...u, id: key };
            });
            return dbUsers;
        }

        // Already a keyed object — normalize keys to uppercase
        const dbUsers = {};
        Object.entries(result).forEach(([key, u]) => {
            const normKey = key.toUpperCase();
            dbUsers[normKey] = { ...u, id: normKey };
        });
        return dbUsers;
    }

    static async saveUser(user, isUpdate = false) {
        // Server endpoint: POST /api/users (for both create and update — it upserts by ID)
        const payload = {
            id: (user.username || user.id || '').toUpperCase(),
            name: user.name || 'Student',
            password: user.password,
            branch: user.branch,
            year: user.year,
            section: user.section,
            batch: user.batch
        };

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error || 'Failed to save user');
        }
        return true;
    }

    static async saveUsersBulk(newUsers) {
        // Server endpoint: POST /api/users/bulk — expects a keyed object { id: userObj, ... }
        const payload = {};
        Object.values(newUsers).forEach(u => {
            const key = (u.id || u.username || '').toUpperCase();
            if (key) {
                payload[key] = {
                    id: key,
                    name: u.name,
                    password: u.password,
                    branch: u.branch,
                    year: u.year,
                    section: u.section,
                    batch: u.batch
                };
            }
        });

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/users/bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error || 'Failed to bulk save users');
        }
        return true;
    }

    static async deleteUser(id) {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to delete user');
        return true;
    }
}

window.UserService = UserService;

console.log('ExamiNation App Initialized — API-Only Mode');
