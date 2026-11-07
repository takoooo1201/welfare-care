# 前後端打包成同一個容器（Cloud Run：gcloud run deploy welfare-care --source . --region asia-east1）
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
# Cloud Run 會提供 PORT；SQLite 放在容器的暫存空間（重啟後重新載入示範資料）
ENV PORT=8080 DB_PATH=/tmp/welfare-care.db
EXPOSE 8080
USER node
CMD ["node", "server/index.ts"]
