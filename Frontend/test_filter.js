const session = { id: 1, role: 'student', branch: null, batch: null };

const exams = [
    {
      "id": 78,
      "title": "CSE-5 Class Test143",
      "subject": "C language+typing",
      "branch": ["CSE"],
      "batch": ["2022-2026", "2023-2027", "2024-2028", "2025-2029"],
      "duration": 60,
      "status": "published",
      "attemptLimit": 1,
    }
];

const filteredExams = exams.filter(e => {
    const studentBatch = String(session.batch || '').trim();
    const studentBranch = String(session.branch || '').toUpperCase().trim();

    const parseExamField = (field) => {
        if (!field) return [];
        if (Array.isArray(field)) return field.map(b => String(b).toUpperCase().trim());
        if (typeof field === 'string' && field.startsWith('[')) {
            try { return JSON.parse(field).map(b => String(b).toUpperCase().trim()); } catch(e) {}
        }
        return field.split(',').map(b => String(b).toUpperCase().trim()).filter(Boolean);
    };

    const examBranches = parseExamField(e.branch);
    const examBatches  = parseExamField(e.batch);

    const branchOpen = examBranches.length === 0 || examBranches.includes('ALL');
    const batchOpen  = examBatches.length === 0 || examBatches.includes('ALL');

    const branchMatch = branchOpen || !studentBranch || studentBranch === 'UNDEFINED'
        || examBranches.includes(studentBranch);

    const batchMatch = batchOpen || !studentBatch || studentBatch === 'UNDEFINED'
        || examBatches.includes(studentBatch.toUpperCase());

    return branchMatch && batchMatch;
});

console.log('Null branch/batch:', filteredExams.length);

session.branch = 'CSE';
session.batch = '2025-2029';

console.log('CSE 2025-2029:', exams.filter(e => {
    const studentBatch = String(session.batch || '').trim();
    const studentBranch = String(session.branch || '').toUpperCase().trim();
    const parseExamField = (field) => {
        if (!field) return [];
        if (Array.isArray(field)) return field.map(b => String(b).toUpperCase().trim());
        if (typeof field === 'string' && field.startsWith('[')) {
            try { return JSON.parse(field).map(b => String(b).toUpperCase().trim()); } catch(e) {}
        }
        return field.split(',').map(b => String(b).toUpperCase().trim()).filter(Boolean);
    };
    const examBranches = parseExamField(e.branch);
    const examBatches  = parseExamField(e.batch);
    const branchOpen = examBranches.length === 0 || examBranches.includes('ALL');
    const batchOpen  = examBatches.length === 0 || examBatches.includes('ALL');
    const branchMatch = branchOpen || !studentBranch || studentBranch === 'UNDEFINED'
        || examBranches.includes(studentBranch);
    const batchMatch = batchOpen || !studentBatch || studentBatch === 'UNDEFINED'
        || examBatches.includes(studentBatch.toUpperCase());
    return branchMatch && batchMatch;
}).length);

session.branch = 'MECH';

console.log('MECH 2025-2029:', exams.filter(e => {
    const studentBatch = String(session.batch || '').trim();
    const studentBranch = String(session.branch || '').toUpperCase().trim();
    const parseExamField = (field) => {
        if (!field) return [];
        if (Array.isArray(field)) return field.map(b => String(b).toUpperCase().trim());
        if (typeof field === 'string' && field.startsWith('[')) {
            try { return JSON.parse(field).map(b => String(b).toUpperCase().trim()); } catch(e) {}
        }
        return field.split(',').map(b => String(b).toUpperCase().trim()).filter(Boolean);
    };
    const examBranches = parseExamField(e.branch);
    const examBatches  = parseExamField(e.batch);
    const branchOpen = examBranches.length === 0 || examBranches.includes('ALL');
    const batchOpen  = examBatches.length === 0 || examBatches.includes('ALL');
    const branchMatch = branchOpen || !studentBranch || studentBranch === 'UNDEFINED'
        || examBranches.includes(studentBranch);
    const batchMatch = batchOpen || !studentBatch || studentBatch === 'UNDEFINED'
        || examBatches.includes(studentBatch.toUpperCase());
    return branchMatch && batchMatch;
}).length);
