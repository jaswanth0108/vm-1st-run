const { exec, execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const CustomError = require('../utils/customError');
const os = require('os');

const TIMEOUT_MS = 10000; // 10 seconds max execution
const TEMP_DIR = path.join(os.tmpdir(), 'vm_compiler');

// Supported language configs
const LANGUAGE_CONFIG = {
    javascript: { ext: 'js',  compile: null,                         run: (f) => `node "${f}"` },
    python:     { ext: 'py',  compile: null,                         run: (f) => `python3 "${f}"` },
    c:          { ext: 'c',   compile: (f, o) => `gcc "${f}" -o "${o}" -lm`, run: (o) => `"${o}"` },
    cpp:        { ext: 'cpp', compile: (f, o) => `g++ "${f}" -o "${o}" -lm`,  run: (o) => `"${o}"` },
    java:       { ext: 'java', compile: (f, dir) => `javac -d "${dir}" "${f}"`, run: (dir, cls) => `java -cp "${dir}" ${cls}` }
};

/**
 * Check if a command/binary is available on the system.
 */
const isCommandAvailable = (cmd) => new Promise((resolve) => {
    exec(`which ${cmd} || where ${cmd}`, (err) => resolve(!err));
});

/**
 * Runs code in a given language with optional stdin.
 * @param {string} language - one of: javascript, python, c, cpp, java
 * @param {string} code
 * @param {string} input - stdin string
 */
const runCode = async (language, code, input = '') => {
    const lang = language.toLowerCase();
    const config = LANGUAGE_CONFIG[lang];

    if (!config) {
        throw new CustomError(`Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_CONFIG).join(', ')}`, 400);
    }

    // Pre-check: verify the required binary is available
    const binaryMap = { c: 'gcc', cpp: 'g++', java: 'javac', python: 'python3', javascript: 'node' };
    const binary = binaryMap[lang];
    if (binary) {
        const available = await isCommandAvailable(binary);
        if (!available) {
            return {
                success: true,
                output: '',
                error: `Language "${language}" is not available on this server. Only JavaScript and Python are supported in the current deployment.`
            };
        }
    }

    const uniqueId = crypto.randomUUID();
    await fs.mkdir(TEMP_DIR, { recursive: true });

    const codeFileName = lang === 'java' ? 'Main' : uniqueId;
    const codeFile = path.join(TEMP_DIR, `${codeFileName}.${config.ext}`);
    const inputFile = path.join(TEMP_DIR, `${uniqueId}.in`);
    const outputBin = path.join(TEMP_DIR, uniqueId); // for compiled languages

    try {
        // Write code and input to temp files
        await Promise.all([
            fs.writeFile(codeFile, code),
            fs.writeFile(inputFile, input)
        ]);

        // --- Compilation Step (for C, C++, Java) ---
        if (config.compile) {
            let compileCmd;
            if (lang === 'java') {
                compileCmd = config.compile(codeFile, TEMP_DIR);
            } else {
                compileCmd = config.compile(codeFile, outputBin);
            }

            const compileError = await new Promise((resolve) => {
                exec(compileCmd, { timeout: 15000 }, (err, stdout, stderr) => {
                    resolve(err ? (stderr || err.message) : null);
                });
            });

            if (compileError) {
                return { success: true, output: '', error: `Compilation Error:\n${compileError}` };
            }
        }

        // --- Execution Step ---
        let runCmd;
        if (lang === 'java') {
            // Java: run class Main from the temp dir
            runCmd = config.run(TEMP_DIR, 'Main');
        } else if (config.compile) {
            runCmd = config.run(outputBin);
        } else {
            runCmd = config.run(codeFile);
        }

        // Use input file as stdin
        const fullCmd = `${runCmd} < "${inputFile}"`;

        const { output, error } = await new Promise((resolve) => {
            exec(fullCmd, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
                if (err && err.killed) {
                    return resolve({ output: '', error: 'Time Limit Exceeded (10s). Possible infinite loop.' });
                }
                if (err && !stdout) {
                    return resolve({ output: '', error: stderr || err.message });
                }
                resolve({ output: stdout.trim(), error: stderr ? stderr.trim() : null });
            });
        });

        return { success: true, output, error: error || null };

    } finally {
        // Cleanup temp files
        const filesToDelete = [codeFile, inputFile, outputBin, outputBin + '.exe'];
        await Promise.all(filesToDelete.map(f => fs.unlink(f).catch(() => {})));
    }
};

/**
 * Evaluates code against multiple test cases (used during exam submission scoring).
 */
const evaluateTestCases = async (code, testCases, language = 'javascript') => {
    const results = [];
    let passedCount = 0;

    for (const tc of testCases) {
        try {
            const result = await runCode(language, code, tc.input || '');
            const passed = result.output === (tc.expected_output || '').trim();
            if (passed) passedCount++;

            results.push({
                input: tc.input,
                expected: tc.expected_output,
                actual: result.output,
                error: result.error || null,
                passed
            });
        } catch (err) {
            results.push({
                input: tc.input,
                expected: tc.expected_output,
                error: err.message,
                passed: false
            });
        }
    }

    return {
        total: testCases.length,
        passed: passedCount,
        allPassed: passedCount === testCases.length,
        details: results
    };
};

module.exports = { runCode, evaluateTestCases };
