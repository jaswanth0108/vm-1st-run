const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const CustomError = require('../utils/customError');
const os = require('os');

const TIMEOUT_MS = 10000; // 10 seconds max execution
const TEMP_DIR = path.join(os.tmpdir(), 'vm_compiler');

// All supported language configs
const LANGUAGE_CONFIG = {
    javascript: { ext: 'js', compile: null, run: (f) => `node "${f}"` },
    python: { 
        ext: 'py', 
        compile: null, 
        run: async (f) => {
            const hasPython3 = await isCommandAvailable('python3');
            return hasPython3 ? `python3 "${f}"` : `python "${f}"`;
        }
    },
    c: { ext: 'c', compile: (f, o) => `gcc "${f}" -o "${o}" -lm`, run: (o) => `"${o}"` },
    cpp: { ext: 'cpp', compile: (f, o) => `g++ "${f}" -o "${o}" -lm`, run: (o) => `"${o}"` },
    java: { ext: 'java', compile: (f, dir) => `javac -d "${dir}" "${f}"`, run: (dir) => `java -cp "${dir}" Main` }
};

/**
 * Check if a system binary is available
 */
const isCommandAvailable = (cmd) => new Promise((resolve) => {
    exec(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, (err) => resolve(!err));
});

/**
 * Runs code in the specified language with optional stdin.
 */
const runCode = async (language, code, input = '') => {
    const lang = language.toLowerCase();
    const config = LANGUAGE_CONFIG[lang];

    if (!config) {
        throw new CustomError(`Unsupported language: "${language}"`, 400);
    }

    const uniqueId = crypto.randomUUID();
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Java must use class name "Main"
    const codeFileName = lang === 'java' ? 'Main' : uniqueId;
    const codeFile  = path.join(TEMP_DIR, `${codeFileName}.${config.ext}`);
    const inputFile = path.join(TEMP_DIR, `${uniqueId}.in`);
    const outputBin = path.join(TEMP_DIR, uniqueId); // compiled binary for C/C++

    try {
        // Write code and input to temp files
        await Promise.all([
            fs.writeFile(codeFile, code),
            fs.writeFile(inputFile, input || '')
        ]);

        // ------- Compile step (C, C++, Java) -------
        if (config.compile) {
            const compileCmd = lang === 'java'
                ? config.compile(codeFile, TEMP_DIR)
                : config.compile(codeFile, outputBin);

            const compileError = await new Promise((resolve) => {
                exec(compileCmd, { timeout: 15000 }, (err, stdout, stderr) => {
                    resolve(err ? (stderr || err.message) : null);
                });
            });

            if (compileError) {
                return { success: true, output: '', error: `Compilation Error:\n${compileError}` };
            }
        }

        // ------- Execute step -------
        let runCmd;
        if (lang === 'java') {
            runCmd = config.run(TEMP_DIR);
        } else if (config.compile) {
            runCmd = config.run(outputBin);
        } else {
            // Handle async run functions (like Python detection)
            runCmd = typeof config.run === 'function' && config.run.constructor.name === 'AsyncFunction'
                ? await config.run(codeFile)
                : config.run(codeFile);
        }

        const fullCmd = `${runCmd} < "${inputFile}"`;

        const { output, error } = await new Promise((resolve) => {
            exec(fullCmd, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
                if (err && err.killed) {
                    return resolve({ output: '', error: 'Time Limit Exceeded (10s). Check for infinite loops.' });
                }
                resolve({
                    output: (stdout || '').trim(),
                    error: stderr
                        ? stderr.trim()
                        : (err && !stdout ? err.message : null)
                });
            });
        });

        return { success: true, output, error: error || null };

    } finally {
        // Cleanup all temp files
        await Promise.all([
            fs.unlink(codeFile).catch(() => {}),
            fs.unlink(inputFile).catch(() => {}),
            fs.unlink(outputBin).catch(() => {}),
            fs.unlink(outputBin + '.exe').catch(() => {})
        ]);
    }
};

/**
 * Evaluates code against multiple test cases (used during exam submission scoring)
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
