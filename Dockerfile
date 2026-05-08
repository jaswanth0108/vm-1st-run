# ─── Vignan Mastery 1.0 — Production Docker Image ───────────────────────────
#
# Base: Node.js 20 LTS on Debian slim
# Installed compilers (run LOCALLY on this server — no external API needed):
#   • GCC   → C compilation       (gcc)
#   • G++   → C++ compilation     (g++)
#   • JDK   → Java compilation    (javac + java)
#   • Python3 → Python execution  (python3)
#   • Node.js → JavaScript        (node, already in base image)
#
# Other languages (Go, TypeScript, Ruby, PHP, Kotlin, Swift, etc.)
# route to Wandbox cloud as a fallback — no installation needed.

FROM node:20-slim

# Install system compilers and Java runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        default-jdk-headless \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && python3 --version \
    && gcc --version \
    && g++ --version \
    && java -version

# Set working directory
WORKDIR /app

# Copy dependency files first (Docker cache optimization)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --omit=dev

# Copy all project files
COPY . .

# Expose the server port (Render uses $PORT, defaulting to 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', r => process.exit(r.statusCode === 200 || r.statusCode === 304 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "server.js"]
