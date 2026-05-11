const { execSync } = require("child_process");

// ─── Language Configuration ──────────────────────────────────────────────────
const LANGUAGES = {
  c: {
    name: "C",
    extension: ".c",
    compiled: true,
    compileCmd: (inputFile, outputFile) =>
      `gcc "${inputFile}" -o "${outputFile}" -lm`,
    runCmd: (outputFile) => `"${outputFile}"`,
    boilerplate:
      '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
  },

  cpp: {
    name: "C++",
    extension: ".cpp",
    compiled: true,
    compileCmd: (inputFile, outputFile) =>
      `g++ "${inputFile}" -o "${outputFile}" -lm`,
    runCmd: (outputFile) => `"${outputFile}"`,
    boilerplate:
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}',
  },

  java: {
    name: "Java",
    extension: ".java",
    compiled: true,
    // Java requires the filename to match the class name
    compileCmd: (inputFile, outputDir) =>
      `javac "${inputFile}" -d "${outputDir}"`,
    runCmd: (outputDir, className) => `java -cp "${outputDir}" ${className}`,
    boilerplate:
      'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
    needsClassName: true,
  },

  python: {
    name: "Python",
    extension: ".py",
    compiled: false,
    runCmd: (file) => `python "${file}"`,
    boilerplate: 'print("Hello, World!")',
  },

  javascript: {
    name: "JavaScript",
    extension: ".js",
    compiled: false,
    runCmd: (file) => `node "${file}"`,
    boilerplate: 'console.log("Hello, World!");',
  },
};

// ─── Check if a compiler/runtime is installed ────────────────────────────────
function isCommandAvailable(command) {
  try {
    execSync(`where ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── Get availability status of all languages ────────────────────────────────
function getLanguageStatus() {
  const compilerMap = {
    c: "gcc",
    cpp: "g++",
    java: "javac",
    python: "python",
    javascript: "node",
  };

  const status = {};
  for (const [key, lang] of Object.entries(LANGUAGES)) {
    const cmd = compilerMap[key];
    status[key] = {
      name: lang.name,
      available: isCommandAvailable(cmd),
      compiler: cmd,
    };
  }
  return status;
}

module.exports = { LANGUAGES, getLanguageStatus, isCommandAvailable };
