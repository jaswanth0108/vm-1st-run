const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const CustomError = require('../utils/customError');
const os = require('os');

const TIMEOUT_MS = 10000; // 10 seconds max local execution
const TEMP_DIR = path.join(os.tmpdir(), 'vm_compiler');

// Piston API (free public compiler service for sandboxed execution)
const PISTON_API = 'https://emkc.org/api/v2/piston/execute';

// Languages that always go through Piston (because system compilers may not be installed)
const PISTON_LANGUAGES = {
    c:    { language: 'c',          version: '*' },
    cpp:  { language: 'c++',        version: '*' },
    java: { language: 'java',       version: '*' }
};

// Languages that run locally (Node.js and Python are always available on Render)
const LOCAL_LANGUAGE_CONFIG = {
    javascript: { ext: 'js', run: (f) => `node "${f}"` },
    python:     { ext: 'py', run: (f) => `python3 "${f}"` }
};

/**
 * Run code through the Piston public API (for C, C++, Java)
 */
const runViaPiston = async (language, code, input) => {
    const langConfig = PISTON_LANGUAGES[language];
    if (!langConfig) throw new CustomError('Language not configured for Piston', 400);

    const payload = JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: code }],
        stdin: input || ''
    });

    return new Promise((resolve, reject) => {
        const url = new URL(PISTON_API);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const run = parsed.run || {};
                    const compile = parsed.compile || {};

                    // Compilation error
                    if (compile.code !== undefined && compile.code !== 0) {
                        return resolve({ success: true, output: '', error: `Compilation Error:\n${compile.stderr || compile.output || 'Unknown compile error'}` });
                    }

                    // Runtime result
                    const output = (run.stdout || '').trim();
                    const stderr = (run.stderr || '').trim();
                    const exitCode = run.code || 0;

                    if (exitCode !== 0 && stderr) {
                        return resolve({ success: true, output: output || '', error: stderr });
                    }

                    resolve({ success: true, output, error: stderr || null });
                } catch (e) {
                    reject(new CustomError('Failed to parse Piston response: ' + e.message, 500));
                }
            });
        });

        req.on('error', (e) => {
            reject(new CustomError(`Piston API unreachable: ${e.message}. Check your internet connection.`, 503));
        });
        req.setTimeout(15000, () => {
            req.abort();
            reject(new CustomError('Piston API timed out. Try again in a moment.', 504));
        });

        req.write(payload);
        req.end();
    });
};

/**
 * Run code locally using child_process (for JavaScript and Python)
 */
const runLocally = async (language, code, input) => {
    const config = LOCAL_LANGUAGE_CONFIG[language];
    if (!config) throw new CustomError(`Language "${language}" is not supported locally.`, 400);

    const uniqueId = crypto.randomUUID();
    await fs.mkdir(TEMP_DIR, { recursive: true });

    const codeFile = path.join(TEMP_DIR, `${uniqueId}.${config.ext}`);
    const inputFile = path.join(TEMP_DIR, `${uniqueId}.in`);

    try {
        await Promise.all([
            fs.writeFile(codeFile, code),
            fs.writeFile(inputFile, input || '')
        ]);

        const runCmd = config.run(codeFile);
        const fullCmd = `${runCmd} < "${inputFile}"`;

        const { output, error } = await new Promise((resolve) => {
            exec(fullCmd, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
                if (err && err.killed) {
                    return resolve({ output: '', error: 'Time Limit Exceeded (10s). Possible infinite loop.' });
                }
                resolve({
                    output: (stdout || '').trim(),
                    error: stderr ? stderr.trim() : (err && !stdout ? err.message : null)
                });
            });
        });

        return { success: true, output, error: error || null };
    } finally {
        await Promise.all([
            fs.unlink(codeFile).catch(() => {}),
            fs.unlink(inputFile).catch(() => {})
        ]);
    }
};

/**
 * Main entry point: routes to Piston or local execution based on language.
 * @param {string} language - javascript, python, c, cpp, java
 * @param {string} code
 * @param {string} input - stdin
 */
const runCode = async (language, code, input = '') => {
    const lang = language.toLowerCase();

    const supportedAll = [...Object.keys(PISTON_LANGUAGES), ...Object.keys(LOCAL_LANGUAGE_CONFIG)];
    if (!supportedAll.includes(lang)) {
        throw new CustomError(`Unsupported language: "${language}". Supported: ${supportedAll.join(', ')}`, 400);
    }

    if (PISTON_LANGUAGES[lang]) {
        return await runViaPiston(lang, code, input);
    } else {
        return await runLocally(lang, code, input);
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
