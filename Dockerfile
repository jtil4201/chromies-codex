FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /data
COPY --from=build /app/dist ./dist
COPY data ./data
CMD ["node", "dist/index.js"]
