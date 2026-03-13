-- PostgreSQL Schema for College Exam Portal

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('Student', 'Teacher', 'admin')) NOT NULL,
    branch VARCHAR(50),
    year VARCHAR(10),
    section VARCHAR(10),
    batch VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exams (
    id SERIAL PRIMARY KEY,
    teacher_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_minutes INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    exam_id INT NOT NULL,
    type VARCHAR(20) CHECK (type IN ('MCQ', 'Descriptive', 'Coding')) NOT NULL,
    problem_statement TEXT NOT NULL,
    mcq_options JSONB DEFAULT NULL, 
    correct_answer TEXT, 
    marks INT DEFAULT 1,
    test_cases JSONB DEFAULT NULL, 
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    exam_id INT NOT NULL,
    student_id INT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL,
    status VARCHAR(20) CHECK (status IN ('InProgress', 'Submitted')) DEFAULT 'InProgress',
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL,
    question_id INT NOT NULL,
    student_answer TEXT NOT NULL,
    is_correct BOOLEAN NULL,
    marks_awarded INT DEFAULT 0,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL UNIQUE,
    student_id INT NOT NULL,
    exam_id INT NOT NULL,
    total_questions INT NOT NULL,
    attempted INT NOT NULL,
    correct INT NOT NULL,
    wrong INT NOT NULL,
    unattempted INT NOT NULL,
    total_marks INT NOT NULL,
    obtained_marks INT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    status VARCHAR(10) CHECK (status IN ('Pass', 'Fail')) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exam ON reports(exam_id);
CREATE INDEX IF NOT EXISTS idx_student ON reports(student_id);
