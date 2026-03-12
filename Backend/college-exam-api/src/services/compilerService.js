const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const CustomError = require('../utils/customError');

const TIMEOUT_MS = 5000;

const runCode = async (code, input) => {
    const uniqueId = crypto.randomUUID();
    const tempDir = path.join(__dirname, '../../temp');

    await fs.mkdir(tempDir, { recursive: true }).catch(console.error);

    const codeFilePath = path.join(tempDir, `${uniqueId}.js`);
    const inputFilePath = path.join(tempDir, `${uniqueId}.in`);

    try {
        await fs.writeFile(codeFilePath, code);
        await fs.writeFile(inputFilePath, input);

        return await new Promise((resolve, reject) => {
            exec(`node ${codeFilePath} < ${inputFilePath}`, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
                if (error) {
                    if (error.killed) {
                        return reject(new CustomError('Execution Timed Out (Possible Infinite Loop)', 400));
                    }
                    return reject(new CustomError(`Runtime Error: ${stderr || error.message}`, 400));
                }
                resolve(stdout.trim());
            });
        });
    } finally {
        // Cleanup Temp files asynchronously
        fs.unlink(codeFilePath).catch(() => { });
        fs.unlink(inputFilePath).catch(() => { });
    }
};

const evaluateTestCases = async (code, testCases) => {
    const results = [];
    let passedCount = 0;

    for (const tc of testCases) {
        try {
            const output = await runCode(code, tc.input);
            const passed = output === tc.expected_output.trim();
            if (passed) passedCount++;

            results.push({
                input: tc.input,
                expected: tc.expected_output,
                actual: output,
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

module.exports = {
    runCode,
    evaluateTestCases
};
