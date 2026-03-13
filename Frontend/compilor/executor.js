const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { LANGUAGES, isCommandAvailable } = require('./languages');

// ─── Configuration ───────────────────────────────────────────────────────────
const MAX_TIMEOUT_MS = 10000;    // 10 seconds max
const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds default
const MAX_OUTPUT_BYTES = 10240;  // 10 KB max output

// ─── Helper: Create a temp directory for this execution ──────────────────────
function createTempDir() {
  const tempBase = path.join(os.tmpdir(), 'compilor');
  if (!fs.existsSync(tempBase)) {
    fs.mkdirSync(tempBase, { recursive: true });
  }
  const tempDir = path.join(tempBase, uuidv4());
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// ─── Helper: Clean up temp directory ─────────────────────────────────────────
function cleanupTempDir(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Cleanup failed for ${tempDir}:`, err.message);
  }
}

// ─── Helper: Extract Java class name from code ──────────────────────────────
function extractJavaClassName(code) {
  const match = code.match(/public\s+class\s+(\w+)/);
  return match ? match[1] : 'Main';
}

// ─── Helper: Kill process tree (Windows) ─────────────────────────────────────
function killProcessTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'pipe', timeout: 3000 });
  } catch (e) {
    // Fallback
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e2) {
      // Process might already be dead
    }
  }
}

// ─── Helper: Run a command and capture output ────────────────────────────────
function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const { input, timeout = DEFAULT_TIMEOUT_MS, cwd, useShell = false } = options;

    let stdout = '';
    let stderr = '';
    let killed = false;
    let resolved = false;
    const startTime = Date.now();
    const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT_MS);

    const spawnOpts = {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    };

    // Use shell only for commands that need it (like gcc, python, node)
    // Don't use shell for direct .exe execution
    if (useShell) {
      spawnOpts.shell = true;
    }

    let proc;
    try {
      proc = spawn(command, args, spawnOpts);
    } catch (err) {
      return resolve({
        success: false,
        stdout: '',
        stderr: `Failed to start process: ${err.message}`,
        exitCode: -1,
        executionTime: Date.now() - startTime,
        timedOut: false,
      });
    }

    function doResolve(result) {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    }

    // Send stdin if provided
    if (input !== undefined && input !== null && input !== '') {
      try {
        proc.stdin.write(input);
      } catch (e) {
        // stdin might be closed
      }
    }
    try {
      proc.stdin.end();
    } catch (e) {
      // stdin might be closed
    }

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    // Timeout handler
    const timer = setTimeout(() => {
      killed = true;
      killProcessTree(proc.pid);

      // Force resolve after a short delay if process doesn't close
      setTimeout(() => {
        doResolve({
          success: false,
          stdout: stdout.replace(/^\n+|\n+$/g, ''),
          stderr: 'Error: Execution timed out (exceeded time limit)',
          exitCode: -1,
          executionTime: Date.now() - startTime,
          timedOut: true,
        });
      }, 500);
    }, effectiveTimeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const executionTime = Date.now() - startTime;

      if (killed) {
        doResolve({
          success: false,
          stdout: stdout.replace(/^\n+|\n+$/g, ''),
          stderr: 'Error: Execution timed out (exceeded time limit)',
          exitCode: code,
          executionTime,
          timedOut: true,
        });
      } else {
        // Truncate output if too long
        if (stdout.length > MAX_OUTPUT_BYTES) {
          stdout = stdout.substring(0, MAX_OUTPUT_BYTES) + '\n... [Output truncated]';
        }
        if (stderr.length > MAX_OUTPUT_BYTES) {
          stderr = stderr.substring(0, MAX_OUTPUT_BYTES) + '\n... [Error output truncated]';
        }

        doResolve({
          success: code === 0,
          stdout: stdout.replace(/^\n+|\n+$/g, ''),
          stderr: stderr.replace(/^\n+|\n+$/g, ''),
          exitCode: code,
          executionTime,
          timedOut: false,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      doResolve({
        success: false,
        stdout: '',
        stderr: `Process error: ${err.message}`,
        exitCode: -1,
        executionTime: Date.now() - startTime,
        timedOut: false,
      });
    });
  });
}

// ─── Compile step (for compiled languages) ───────────────────────────────────
async function compileCode(language, sourceFile, tempDir) {
  const lang = LANGUAGES[language];
  if (!lang || !lang.compiled) return { success: true };

  let command, args;

  if (language === 'java') {
    command = 'javac';
    args = [sourceFile, '-d', tempDir];
  } else {
    const outputFile = path.join(tempDir, 'program.exe');
    const compiler = language === 'c' ? 'gcc' : 'g++';
    command = compiler;
    args = [sourceFile, '-o', outputFile, '-lm'];
  }

  const result = await runProcess(command, args, {
    cwd: tempDir,
    timeout: 15000,
    useShell: true,
  });

  return {
    success: result.success,
    error: result.stderr,
    executionTime: result.executionTime,
  };
}

// ─── Execute code ────────────────────────────────────────────────────────────
async function executeCode(language, code, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  // Validate language
  const lang = LANGUAGES[language];
  if (!lang) {
    return {
      success: false,
      output: '',
      error: `Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGES).join(', ')}`,
      executionTime: 0,
    };
  }

  // Check compiler availability
  const compilerMap = { c: 'gcc', cpp: 'g++', java: 'javac', python: 'python', javascript: 'node' };
  const compiler = compilerMap[language];
  if (!isCommandAvailable(compiler)) {
    return {
      success: false,
      output: '',
      error: `${lang.name} compiler/runtime "${compiler}" is not installed on this system. Please install it and try again.`,
      executionTime: 0,
    };
  }

  // Create temp directory
  const tempDir = createTempDir();

  try {
    // Determine filename
    let sourceFileName;
    if (language === 'java') {
      const className = extractJavaClassName(code);
      sourceFileName = `${className}${lang.extension}`;
    } else {
      sourceFileName = `program${lang.extension}`;
    }

    const sourceFile = path.join(tempDir, sourceFileName);

    // Write source code to temp file
    fs.writeFileSync(sourceFile, code, 'utf-8');

    // ── Step 1: Compile (if needed) ──
    if (lang.compiled) {
      const compileResult = await compileCode(language, sourceFile, tempDir);

      if (!compileResult.success) {
        return {
          success: false,
          output: '',
          error: compileResult.error || 'Compilation failed',
          executionTime: compileResult.executionTime || 0,
          phase: 'compilation',
        };
      }
    }

    // ── Step 2: Run ──
    let command, args, useShell;

    if (language === 'java') {
      const className = extractJavaClassName(code);
      command = 'java';
      args = ['-cp', tempDir, className];
      useShell = true;
    } else if (lang.compiled) {
      // C / C++ — run the compiled executable directly (no shell)
      const exePath = path.join(tempDir, 'program.exe');
      command = exePath;
      args = [];
      useShell = false; // Run .exe directly without shell wrapper
    } else if (language === 'python') {
      command = 'python';
      args = [sourceFile];
      useShell = true;
    } else if (language === 'javascript') {
      command = 'node';
      args = [sourceFile];
      useShell = true;
    }

    const runResult = await runProcess(command, args, {
      input,
      timeout: Math.min(timeout, MAX_TIMEOUT_MS),
      cwd: tempDir,
      useShell,
    });

    return {
      success: runResult.success,
      output: runResult.stdout,
      error: runResult.stderr,
      executionTime: runResult.executionTime,
      timedOut: runResult.timedOut,
      phase: 'execution',
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Internal error: ${err.message}`,
      executionTime: 0,
    };
  } finally {
    // Always clean up
    cleanupTempDir(tempDir);
  }
}

module.exports = { executeCode };
