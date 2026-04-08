FROM node:20-slim

WORKDIR /app

# Copy package files from the nested backend directory
COPY Backend/college-exam-api/package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the backend source code
COPY Backend/college-exam-api/ ./

# Expose the port (Render will override this via process.env.PORT)
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
