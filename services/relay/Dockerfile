# 翻译加速节点镜像 — 多阶段构建。
#
# 见 ADR-0003：relay 以 monorepo 成员形式存在于本仓库，compose 直接引用构建上下文。

# --- 构建阶段 ---
FROM node:22-alpine AS builder
WORKDIR /app

# 根 package.json + pnpm-workspace.yaml + 锁文件先入，利用层缓存。
# 只需 relay 的依赖，但 pnpm workspace 需要完整 lockfile 才能 --frozen-lockfile。
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/relay/package.json ./services/relay/package.json

RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
# --ignore-scripts：根包的 postinstall 是 `wxt prepare`，依赖 entrypoints/，
# 而镜像里只构建 relay、不构建扩展，跳过脚本可避免 wxt 因找不到入口而失败。
# relay 的运行时依赖（nest / fastify / ioredis / rxjs）均无构建期 postinstall。
RUN pnpm install --frozen-lockfile --filter @omni/relay... --ignore-scripts

COPY services/relay ./services/relay
RUN pnpm --filter @omni/relay build

# --- 运行阶段 ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# tslib + reflect-metadata 是 Nest 运行时必需；其余依赖从构建阶段复制。
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/relay/node_modules ./services/relay/node_modules
COPY --from=builder /app/services/relay/dist ./dist
COPY --from=builder /app/services/relay/package.json ./package.json

# 以非 root 运行
USER node

EXPOSE 3000

# 启动前先等 Redis：compose 的 healthcheck 已保证顺序，但直跑 docker run 时给一层兜底。
CMD ["node", "dist/main.js"]
