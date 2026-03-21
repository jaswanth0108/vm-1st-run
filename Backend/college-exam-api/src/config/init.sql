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
    teacher_id INT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    branch JSONB DEFAULT '["All"]',
    batch JSONB DEFAULT '["All"]',
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_minutes INT NOT NULL,
    status VARCHAR(20) DEFAULT 'published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
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
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL,
    question_id INT NOT NULL,
    student_answer TEXT NOT NULL,
    is_correct BOOLEAN NULL,
    marks_awarded INT DEFAULT 0,
    test_cases_passed JSONB DEFAULT NULL,
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

-- Migrations for existing tables (Ensures updates apply if tables already exist)
ALTER TABLE exams ALTER COLUMN teacher_id DROP NOT NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS branch JSONB DEFAULT '["All"]';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS batch JSONB DEFAULT '["All"]';

ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS year VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS section VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS batch VARCHAR(20);

-- Fix question types constraint
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN ('MCQ', 'Descriptive', 'Coding', 'mcq', 'coding', 'text'));

-- Add status column to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published';

-- Add attempt limit column to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS attempt_limit INT DEFAULT 1;

-- Seed Default Admin User (Password: admin123)
INSERT INTO users (name, username, password_hash, role)
SELECT 'Admin', 'admin', '$2a$10$0zR9t1m88/T2Ff2b2l6l.O9yX5c5l6l.O9yX5c5l6l.O9yX5c5l6l.O', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

-- Add time_taken column to answers (seconds spent on each question)
ALTER TABLE answers ADD COLUMN IF NOT EXISTS time_taken INT DEFAULT 0;

-- Add test_cases_passed to answers
ALTER TABLE answers ADD COLUMN IF NOT EXISTS test_cases_passed JSONB DEFAULT NULL;
