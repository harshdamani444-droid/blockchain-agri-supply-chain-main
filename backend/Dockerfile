FROM node:20-slim
WORKDIR /app
COPY backend/package*.json package*.json* ./
RUN npm install
COPY backend/ ./
EXPOSE 4000
CMD ["npm","start"]
