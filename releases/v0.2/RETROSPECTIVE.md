# Sprint v0.2 迭代回顾

| 项 | 内容 |
|---|---|
| **版本号** | v0.2 |
| **关闭日期** | 2026-07-07 |
| **发布版本** | v0.2.0 |
| **关联 RELEASE-NOTES** | `./RELEASE-NOTES.md` |
| **关联里程碑** | https://github.com/Aiden-FE/llm-translator/milestone/1 (已关闭) |

---

## 范围达成

- **计划**:9 项功能(P0×4:unified-adapter / builtin-fallback / traditional-apikey-config / source-picker-ui;P1×5:llm-anthropic-style / llm-streaming / popup-settings / md-render / llm-type-unify)
- **实际交付**:9 项 done,0 deferred;另交付 5 个独立 bug 快修(#5 / #8 / #27 / #28 / #29)
- **达成率**:9 / 9 = 100%
- **偏差分析**:100% 达成,但「9 项 / 7 天」并非健康产能信号,而是四因素叠加——① roadmap 优先级贴合度低(计划优先级与实际价值/落地贴合不足);② 功能事项粒度未按「可独立交付使用的落地单元」切分,边界模糊;③ 时间估算偏保守(3 周计划高估工作量);④ 个人加急推进(含人力加压,非纯估算)。其中 P1 的 5 项(功能事项 5-9)系迭代中途新增,非初始规划;2026-07-06 又发生战略转向(v0.3 改为发布基建 + 应用美化,增长优先)。

| 编号 | 概要标题 | 优先级 | 计划状态 | 实际状态 | 备注 |
|---|---|---|---|---|---|
| 1 | unified-adapter | P0 | 计划 done | done | #10 · PR #12 |
| 2 | builtin-fallback | P0 | 计划 done | done | #14 · PR #15 |
| 3 | traditional-apikey-config | P0 | 计划 done | done | #18 · PR #20 / #19 · PR #21 |
| 4 | source-picker-ui | P0 | 计划 done | done | #16 · PR #17 |
| 5 | llm-anthropic-style | P1 | 中途新增 | done | #22 · PR #23(初始规划外) |
| 6 | llm-streaming | P1 | 中途新增 | done | #25 · PR #26(初始规划外) |
| 7 | popup-settings | P1 | 中途新增 | done | #35 · PR #38(初始规划外) |
| 8 | md-render | P1 | 中途新增 | done | #36 · PR #39(初始规划外) |
| 9 | llm-type-unify | P1 | 中途新增 | done | #43 · PR #44(初始规划外) |

## 周期

- **计划周期**:2026-07-01 ~ 2026-07-22(理论 ≤3 周,里程碑截止 2026-07-22)
- **实际周期**:2026-07-01 ~ 2026-07-07(创建 → 发版 7 天)
- **是否超期**:否(提前约 2 周)
- **超期原因**:不适用。提前根因:时间估算偏保守 + 个人加急推进(同偏差分析 ③④),**非可持续产能基线**——不可作为后续迭代估算参照。

## 遗留问题

| 类型 | 内容 | 处理建议 | 拟纳入版本 |
|---|---|---|---|
| deferred | 多源自动降级与优先级列表 | 本轮源失败仅人工切换,自动降级延后 | v0.3+ |
| deferred | 小窗输入翻译 | 独立交互入口,另一业务链 | v0.5 |
| deferred | 全文翻译(整页 DOM 改造 + 分段并发) | 复杂度高,独立业务链 | v0.4 |
| deferred | 跨浏览器(Firefox/Edge)+ 商店上架 | v0.3 发布基建覆盖 | v0.3 |
| deferred | 翻译历史记录(本地版) | 随免费产品渐进加入,云同步留作后期付费 | 待定 |
| deferred | 商业化 | 开源免费优先,渐进式引入 | 后续评估 |
| 技术债 | 商店发布流水线缺失(无 `deploy.yml`) | v0.3 自动化发布流水线覆盖(GitHub Actions + Chrome Web Store API) | v0.3 |
| 未关 Issue(已移出本里程碑) | 无 | 25 个里程碑 issue 全部 closed | — |

> 本轮已清技术债:划词翻译浮层 iframe 隔离(PR #47,已随 v0.2.0 交付)。

## 下一轮建议

基于本轮经验给 `prodflow-sprint-open` 下一轮(v0.3:发布基建 + 应用美化)的输入:

- **roadmap 优先级贴合度**:规划时优先级须更贴合实际价值与可落地性,避免「计划优先级 ↔ 实际价值」错配。
- **功能事项按「可独立使用的落地单元」切分**:边界清晰、可独立交付与验证,避免范围边界模糊导致中途扩项。
- **时间估算去保守化**:贴近真实工作量,避免「3 周计划 / 7 天交付」的偏差掩盖真实节奏;但须扣除本轮「个人加急」的非可持续成分。
- **节奏可持续化**:不依赖个人加急推进(加急不可持续);v0.3 含发布基建 + 美化两类工作流,更需按可持续节奏排期。
- **范围锁定时机**:本轮中途新增 5 项 P1,后续迭代应在更早节点锁定范围,降低 scope creep 风险。

## 跨 Issue 全局知识沉淀触发(非阻塞)

| 候选 | 说明 | 是否沉淀 | 后续技能 |
|---|---|---|---|
| 多功能共同 ADR | 统一适配层(ADR-001)、流式 port + ReadableStream(ADR-002)、markdown sanitize(ADR-003)、共享组件变体(ADR-004)、responseStyle 协议区分器(ADR-005) | 已沉淀 | — |
| 跨模块 feature | unified-adapter / streaming / popup-settings / markdown-render / llm-type-unify | 已沉淀 | — |
| 跨场景 runbook | 配置 schema 迁移 runbook——#43 的 on-read 无感迁移模式泛化为通用「配置 schema 迁移」流程,供后续版本复用 | 已沉淀 | `knowledges/runbook/config-migration/index.md` |

## 元数据

- 关闭工具:`prodflow-sprint-close`
- 复盘方式:`superpowers:brainstorming` 引导
