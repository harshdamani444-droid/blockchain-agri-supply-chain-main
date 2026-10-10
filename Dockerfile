# Multi-stage Dockerfile for AgriChain (Frontend + Backend)
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy backend source and compiled frontend
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Initialize and seed database
WORKDIR /app/backend
RUN node src/db-init.js && node src/seed.js

EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production

CMD ["node", "src/server.js"]
