/**
 * Main App Script
 * Shared utilities and Data Service.
 */

const DB_EXAMS = 'ems_exams';
const DB_RESULTS = 'ems_results';

class ExamService {
    // --- Exams ---
    static async getExams() {
        try {
            const token = localStorage.getItem('college_exam_portal_token');
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch exams');
            const data = await response.json();
            return data.data || data;
        } catch (error) {
            console.error('Error fetching exams:', error);
            const localData = localStorage.getItem(DB_EXAMS);
            return localData ? JSON.parse(localData) : [];
        }
    }

    static async getExamById(id) {
        try {
            const token = localStorage.getItem('college_exam_portal_token');
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch exam details');
            const data = await response.json();
            return data.data || data;
        } catch (error) {
            console.error('Error fetching exam details:', error);
            const exams = await this.getExams();
            return exams.find(e => e.id === id);
        }
    }

    static async saveExam(exam) {
        // Convert local format to backend expected format if necessary
        const payload = {
            ...exam,
            start_time: exam.startTime || new Date().toISOString(),
            end_time: exam.endTime || new Date(Date.now() + (exam.duration || 60) * 60000).toISOString()
        };

        const token = localStorage.getItem('college_exam_portal_token');
        const isUpdate = !!exam.id && !String(exam.id).startsWith('exam_');
        const url = isUpdate ? `${window.CONFIG.API_BASE_URL}/api/exams/${exam.id}` : `${window.CONFIG.API_BASE_URL}/api/exams`;
        const method = isUpdate ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to sync exam to server');
        }

        // Backup to localStorage for offline fallback
        const localData = localStorage.getItem(DB_EXAMS);
        const exams = localData ? JSON.parse(localData) : [];
        const index = exams.findIndex(e => e.id === exam.id);
        if (index > -1) exams[index] = exam;
        else exams.push(exam);
        localStorage.setItem(DB_EXAMS, JSON.stringify(exams));
        
        return data.data || data;
    }

    static async deleteExam(id) {
        try {
            const token = localStorage.getItem('college_exam_portal_token');
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to delete exam');
            
            // Sync local backup
            const localData = localStorage.getItem(DB_EXAMS);
            if (localData) {
                const exams = JSON.parse(localData).filter(e => e.id !== id);
                localStorage.setItem(DB_EXAMS, JSON.stringify(exams));
            }
            return true;
        } catch (error) {
            console.error('Error deleting exam:', error);
            return false;
        }
    // --- Results ---
    static async submitResult(result) {
        const token = localStorage.getItem('college_exam_portal_token');
        const examId = result.examId || result.id;
        
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/exams/${examId}/submit`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(result)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error?.message || 'Failed to submit exam');
        }

        // Save to local backup
        const localData = localStorage.getItem(DB_RESULTS);
        const results = localData ? JSON.parse(localData) : [];
        results.push(result);
        localStorage.setItem(DB_RESULTS, JSON.stringify(results));
        
        return data;
    }

    static async getResults() {
        try {
            const token = localStorage.getItem('college_exam_portal_token');
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/reports`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch results');
            const data = await response.json();
            return data.data || data;
        } catch (error) {
            console.error('Error fetching results:', error);
            const data = localStorage.getItem(DB_RESULTS);
            return data ? JSON.parse(data) : [];
        }
    }

    static async getStudentResults(studentId) {
        const results = await this.getResults();
        return results.filter(r => r.studentId === studentId);
    }

    // --- Helpers ---
    static generateId() {
        return 'exam_' + Math.random().toString(36).substr(2, 9);
    }
}

window.ExamService = ExamService;

// --- User Service ---
const DB_USERS = 'ems_users_db'; // Maintain existing key for fallback

class UserService {
    static async getUsers() {
        // Always load from localStorage first (source of truth for the admin UI)
        const localData = localStorage.getItem(DB_USERS);
        const localUsers = localData ? JSON.parse(localData) : {};

        try {
            const token = localStorage.getItem('college_exam_portal_token');
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch users');
            const result = await response.json();

            // Backend returns: { success: true, data: [...] } or an array directly
            const dbArray = Array.isArray(result) ? result : (result.data || []);

            // Convert array to keyed object and merge with localStorage object
            const dbUsers = {};
            dbArray.forEach(u => {
                const key = (u.username || u.id || '').toUpperCase();
                if (key) dbUsers[key] = { ...u, id: key };
            });

            // Merge: localStorage is primary, backend fills in any gaps
            return { ...dbUsers, ...localUsers };
        } catch (error) {
            console.error('Error fetching users:', error);
            return localUsers;
        }
    }

    static async saveUser(user) {
        try {
            const token = localStorage.getItem('college_exam_portal_token');
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
            // Mock backend saved users here, new backend registers
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || data.error?.message || 'Failed to save user');

            // Update local fallback
            const users = await this.getUsers();
            users[user.id] = user;
            localStorage.setItem(DB_USERS, JSON.stringify(users));
            return true;
        } catch (error) {
            console.error('Error saving user:', error);
            const data = localStorage.getItem(DB_USERS);
            const users = data ? JSON.parse(data) : {};
            users[user.id] = user;
            localStorage.setItem(DB_USERS, JSON.stringify(users));
            return false;
        }
    }

    static async saveUsersBulk(newUsers) {
        try {
            const token = localStorage.getItem('college_exam_portal_token');

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
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ users: usersArray })
            });
            
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || data.error?.message || 'Failed to bulk save users');

            // Update local fallback
            const users = await this.getUsers();
            const merged = { ...users, ...newUsers };
            localStorage.setItem(DB_USERS, JSON.stringify(merged));
            return true;
        } catch (error) {
            console.error('Error saving bulk users:', error);
            const data = localStorage.getItem(DB_USERS);
            const users = data ? JSON.parse(data) : {};
            const merged = { ...users, ...newUsers };
            localStorage.setItem(DB_USERS, JSON.stringify(merged));
            return false;
        }
    }

    static async deleteUser(id) {
        try {
            const token = localStorage.getItem('college_exam_portal_token');
            const response = await fetch(`${window.CONFIG.API_BASE_URL}/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to delete user');

            // Update local fallback
            const users = await this.getUsers();
            if (users[id]) delete users[id];
            localStorage.setItem(DB_USERS, JSON.stringify(users));
            return true;
        } catch (error) {
            console.error('Error deleting user:', error);
            const data = localStorage.getItem(DB_USERS);
            const users = data ? JSON.parse(data) : {};
            if (users[id]) delete users[id];
            localStorage.setItem(DB_USERS, JSON.stringify(users));
            return false;
        }
    }
}

window.UserService = UserService;

console.log('ExamiNation App Initialized');
