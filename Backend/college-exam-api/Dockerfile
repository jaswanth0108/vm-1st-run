# ============================================================
# Dockerfile for College Exam Portal Backend
# Includes: Node.js, Python3, GCC (C), G++ (C++)
# ============================================================

# Start from the official Node.js 22 slim image (Debian-based)
FROM node:22-slim

# Install system packages needed for the multi-language compiler
# - gcc: C compiler
# - g++: C++ compiler
# - python3: Python3 interpreter
# - default-jdk: Java compiler/runtime (uncomment if you want Java)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3 \
    python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create a symlink so 'python3' works everywhere
RUN ln -sf /usr/bin/python3 /usr/local/bin/python3

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (for caching npm install layer)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of the application source code
COPY . .

# Expose the port the app listens on
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
