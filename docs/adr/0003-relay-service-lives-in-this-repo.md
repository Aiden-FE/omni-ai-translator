# ADR-0003: 加速服务以 monorepo 形态留在本仓库

- **Status**: Accepted
- **Date**: 2026-10-07
- **Scope**: 仓库结构 / CI / Pages

## Context

加速服务需要同时满足三件事：NestJS + fastify 内核、docker-compose 一键部署、在 GitHub Pages 上发布面向自建者的公开文档。契约类型（lookup / commit 的请求响应）由插件与共享服务同时消费。

仓库现状：`pnpm-workspace.yaml` 只有一个 `.` 包；`.github/workflows/pages.yml` 把整个 `docs/` 目录发布到 `https://aiden-fe.github.io/omni-ai-translator/`；现有 `docs/adr/` 已是 ADR 归档地。域名 `https://omni-trans.makabonka.com` 已解析但经 Cloudflare 返回 526（源站证书无效），官方节点尚未落地。

## Decision

加速服务作为 `services/relay/` 留在本仓库，纳入 pnpm workspace（包名 `@omni/relay`）。

- `docker-compose.yml` 放仓库根，一条 `docker compose up -d` 同时起 relay + Redis，端口与 TTL 可用环境变量覆盖。
- 公开文档放 `docs/relay/`，随现有 Pages 工作流自动发布到 `.../omni-ai-translator/relay/`——不需要新增任何 Pages 基础设施。
- 插件与服务共享一份契约类型（`services/relay/src/contracts.ts`），插件侧经 workspace 依赖引用，避免跨仓类型漂移。
- **官方节点 `omni-trans.makabonka.com` 的实际部署不在本轮交付范围内**（Q14=A）。本轮只交付代码与公开文档；域名、Cloudflare 源站证书（当前 526 的成因）、Redis 与 compose 落地、以及验收用的 `/healthz` 验证，由后续独立事项处理。

## Consequences

- 契约演进、客户端行为、服务实现、公开文档在同一个 PR 内完成评审，不会出现"文档描述的协议"与"代码实现的协议"分叉。
- 现有 `pages.yml` 零改动即可发布新文档；`ci.yml` 需新增一个针对 `services/relay` 的 typecheck / lint / test job。
- 仓库从"纯扩展"变为"扩展 + 服务"，`README.md` 的仓库定位描述需要相应调整。
- 代价：Node 服务依赖（NestJS、fastify、ioredis）与扩展依赖共用一份 lockfile。
- 插件侧的「官方加速」选项会**先行上线但暂不可用**（域名仍 526）。这与 fail-open 决策自洽：用户选了官方选项后翻译行为完全不变，只是没有加速收益，且「测试连通」会即时暴露域名未就绪。

## Alternatives Considered

- **独立仓库**（如 `Aiden-FE/omni-trans-relay`）：职责最干净，但契约类型要跨仓同步，文档与插件版本可能错配，自建者拿到 compose 时不知道该配哪个版本的插件。否决。
- **本仓库内独立目录但不纳入 workspace**：省掉 CI 改动，但失去共享契约类型和统一 lockfile，等于半只脚。否决。
