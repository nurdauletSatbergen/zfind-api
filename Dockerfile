FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# dev-стадия: код монтируется через volume в docker-compose,
# COPY нужен для запуска образа и без монтирования
FROM base AS dev
COPY . .
CMD ["npm", "run", "start:dev"]

# прод-стадии (build, prod) добавим позже
