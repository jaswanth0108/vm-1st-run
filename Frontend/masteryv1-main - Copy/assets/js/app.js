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
        if (!response.ok) throw new Error('Failed to fetch exams');
        const data = await response.json();
        return data.data || data;
    }

    static async getExamById(id) {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${id}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to fetch exam details');
        const data = await response.json();
        return data.data || data;
    }

    static async saveExam(exam) {
        const payload = {
            ...exam,
            start_time: exam.startTime || new Date().toISOString(),
            end_time: exam.endTime || new Date(Date.now() + (exam.duration || 60) * 60000).toISOString()
        };

        const isUpdate = !!exam.id && !String(exam.id).startsWith('exam_');
        const url = isUpdate
            ? `${window.CONFIG.API_BASE_URL}/api/exams/${exam.id}`
            : `${window.CONFIG.API_BASE_URL}/api/exams`;
        const method = isUpdate ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to sync exam to server');
        }

        return data.data || data;
    }

    static async deleteExam(id) {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to delete exam');
        return true;
    }

    static async updateExamStatus(id, status) {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ status })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to update exam status');
        }
        return data.data || data;
    }

    // --- Results ---
    static async submitResult(result) {
        const examId = result.examId || result.id;

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${examId}/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(result)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to submit exam');
        }

        return data;
    }

    static async getResults() {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/reports`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (!response.ok) throw new Error('Failed to fetch results');
        const data = await response.json();
        return data.data || data;
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

        // Backend returns: { success: true, data: [...] } or an array directly
        const dbArray = Array.isArray(result) ? result : (result.data || []);

        // Convert array to keyed object for compatibility with admin UI
        const dbUsers = {};
        dbArray.forEach(u => {
            const key = (u.username || u.id || '').toUpperCase();
            if (key) dbUsers[key] = { ...u, id: key };
        });
        return dbUsers;
    }

    static async saveUser(user) {
        const payload = {
            name: user.name || 'Student',
            username: user.id || user.username,
            password: user.password,
            role: 'Student',
            branch: user.branch,
            year: user.year,
            section: user.section,
            batch: user.batch
        };

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to save user');
        }
        return true;
    }

    static async saveUsersBulk(newUsers) {
        const usersArray = Object.values(newUsers).map(u => ({
            name: u.name,
            username: u.id,
            password: u.password,
            role: 'Student',
            branch: u.branch,
            year: u.year,
            section: u.section,
            batch: u.batch
        }));

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/auth/bulk-register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ users: usersArray })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to bulk save users');
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
