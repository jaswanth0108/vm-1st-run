FROM node:20-slim

WORKDIR /app

# Files are now relative to this directory (Backend/college-exam-api)
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the backend source code
COPY . .

# Expose the port (Render will override this via process.env.PORT)
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
