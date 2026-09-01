# Estágio 1: Build do frontend React (Vite)
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Estágio 2: Setup do backend e cópia do frontend buildado
FROM node:22-alpine
WORKDIR /app

# Instalar dependências do backend
COPY backend/package*.json ./
RUN npm install --production

# Copiar os arquivos do backend
COPY backend/ ./

# Copiar os arquivos estáticos do frontend (dist) para a pasta public do backend
COPY --from=frontend-build /app/frontend/dist ./public

# O Cloud Run injeta a variável de ambiente PORT (padrão 8080)
EXPOSE 8080

# Iniciar o servidor Node.js
CMD ["node", "server.js"]
