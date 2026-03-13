const express = require('express');
const cors = require('cors');
const path = require('path');
const { executeCode } = require('./executor');
const { LANGUAGES, getLanguageStatus } = require('./languages');

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── POST /compile — Execute code ───────────────────────────────────────────
app.post('/compile', async (req, res) => {
  const startTime = Date.now();

  try {
    const { language, code, input, timeout } = req.body;

    // Validate required fields
    if (!language) {
      return res.status(400).json({
        success: false,
        output: '',
        error: 'Missing required field: "language"',
        executionTime: 0,
      });
    }

    if (!code || code.trim() === '') {
      return res.status(400).json({
        success: false,
        output: '',
        error: 'Missing required field: "code"',
        executionTime: 0,
      });
    }

    // Normalize language key
    const langKey = language.toLowerCase().replace(/[^a-z+]/g, '').replace('c++', 'cpp');

    // Execute
    const result = await executeCode(langKey, code, input || '', timeout || 5000);

    return res.json({
      success: result.success,
      output: result.output || '',
      error: result.error || '',
      executionTime: result.executionTime || (Date.now() - startTime),
      timedOut: result.timedOut || false,
      language: langKey,
    });
  } catch (err) {
    console.error('Compile endpoint error:', err);
    return res.status(500).json({
      success: false,
      output: '',
      error: `Server error: ${err.message}`,
      executionTime: Date.now() - startTime,
    });
  }
});

// ─── POST /api/compile — Piston-compatible endpoint (for Quiz Website) ───────
app.post('/api/compile', async (req, res) => {
  const startTime = Date.now();

  try {
    const { language, files, stdin } = req.body;

    // Extract code from Piston format: files[0].content
    const code = (files && files.length > 0) ? files[0].content : '';
    const input = stdin || '';

    if (!language) {
      return res.status(400).json({
        run: { stdout: '', stderr: 'Missing required field: "language"', code: 1 },
        message: 'Missing language',
      });
    }

    if (!code || code.trim() === '') {
      return res.status(400).json({
        run: { stdout: '', stderr: 'Missing required field: code', code: 1 },
        message: 'Missing code',
      });
    }

    // Normalize language key
    const langKey = language.toLowerCase().replace(/[^a-z+]/g, '').replace('c++', 'cpp');

    // Execute using internal engine
    const result = await executeCode(langKey, code, input, 5000);

    // Return in Piston-compatible format
    return res.json({
      run: {
        stdout: result.output || '',
        stderr: result.error || '',
        code: result.success ? 0 : 1,
        signal: null,
        output: (result.output || '') + (result.error || ''),
      },
      language: langKey,
    });
  } catch (err) {
    console.error('Piston-compat endpoint error:', err);
    return res.status(500).json({
      run: { stdout: '', stderr: `Server error: ${err.message}`, code: 1 },
      message: `Server error: ${err.message}`,
    });
  }
});

// ─── GET /languages — List supported languages ──────────────────────────────
app.get('/languages', (req, res) => {
  const status = getLanguageStatus();
  const languages = Object.entries(LANGUAGES).map(([key, lang]) => ({
    key,
    name: lang.name,
    extension: lang.extension,
    compiled: lang.compiled,
    available: status[key]?.available || false,
    boilerplate: lang.boilerplate,
  }));
  res.json({ languages });
});

// ─── GET /health — Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  const status = getLanguageStatus();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    languages: status,
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║       ⚡ COMPILOR — Code Execution API ⚡     ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Server running on http://localhost:${PORT}    ║`);
  console.log(`╠══════════════════════════════════════════════╣`);

  const status = getLanguageStatus();
  for (const [key, info] of Object.entries(status)) {
    const icon = info.available ? '✅' : '❌';
    const name = info.name.padEnd(12);
    console.log(`║  ${icon} ${name} (${info.compiler})${' '.repeat(Math.max(0, 22 - info.compiler.length))}║`);
  }

  console.log(`╚══════════════════════════════════════════════╝\n`);
});
