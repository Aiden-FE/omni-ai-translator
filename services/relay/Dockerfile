# 翻译加速节点镜像 — 多阶段构建。
#
# 见 ADR-0003：relay 以 monorepo 成员形式存在于本仓库，compose 直接引用构建上下文。
#
# 网络相关 build args 均为可选、默认为空，因此默认走官方源、不受代理影响。
# 位于需要代理或镜像源的网络环境时，通过 compose 的 .env 传入即可，例如：
#   HTTP_PROXY=http://127.0.0.1:7897
#   NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# HTTP_PROXY / HTTPS_PROXY / NO_PROXY 是 Docker 的内置 build arg，不会写进镜像层。

# --- 构建阶段 ---
FROM node:22-alpine AS builder
WORKDIR /app

ARG NPM_CONFIG_REGISTRY
ENV COREPACK_NPM_REGISTRY=${NPM_CONFIG_REGISTRY}

# 根 package.json + pnpm-workspace.yaml + 锁文件先入，利用层缓存。
# 只需 relay 的依赖，但 pnpm workspace 需要完整 lockfile 才能 --frozen-lockfile。
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/relay/package.json ./services/relay/package.json
COPY services/relay/tsconfig.json ./services/relay/tsconfig.json
COPY services/relay/tsconfig.build.json ./services/relay/tsconfig.build.json
COPY services/relay/src ./services/relay/src

RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
# --ignore-scripts：根包的 postinstall 是 `wxt prepare`，依赖 entrypoints/，
# 而镜像里只构建 relay、不构建扩展，跳过脚本可避免 wxt 因找不到入口而失败。
# relay 的运行时依赖（nest / fastify / ioredis / rxjs）均无构建期 postinstall。
RUN pnpm install --frozen-lockfile --filter @omni/relay... --ignore-scripts

RUN pnpm --filter @omni/relay build

# pnpm deploy 生成自包含的生产依赖目录。
# 不能直接把 services/relay/node_modules 拷走：那里是指向
# ../../../node_modules/.pnpm/... 的相对符号链接，扁平拷贝后链接全部失效
# （运行时报 ERR_MODULE_NOT_FOUND）。--legacy 因本仓库 workspace 未开
# inject-workspace-packages 而必需；relay 不依赖任何 workspace 内包，故安全。
# --ignore-scripts 同上：deploy 内部会跑一次 install，根包 postinstall 的
# `wxt prepare` 会因镜像内没有 entrypoints/ 而失败。runtime 依赖无 postinstall。
RUN pnpm --filter @omni/relay deploy --prod --legacy --ignore-scripts /relay-runtime

# --- 运行阶段 ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# deploy 产物已把 node_modules 物化到 /relay-runtime/node_modules（含 .pnpm 实体），
# 整个目录拷到 /app 即可自包含解析。
COPY --from=builder /relay-runtime ./
COPY --from=builder /app/services/relay/dist ./dist

# 以非 root 运行
USER node

EXPOSE 3000

# compose 的 healthcheck 依赖 /healthz 判定 relay + Redis 是否都就绪。
CMD ["node", "dist/main.js"]
