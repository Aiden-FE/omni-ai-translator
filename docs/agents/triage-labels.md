# Triage Labels（分流标签）

本仓库同时使用两套标签，互不替代。

## 角色标签（主分流信号，与 mattpocock/skills 默认对齐）

| 角色 | 本仓库实际标签 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 维护者还需评估 |
| `needs-info` | `needs-info` | 等待报告人补充信息 |
| `ready-for-agent` | `ready-for-agent` | 需求明确，可交给 Agent |
| `ready-for-human` | `ready-for-human` | 需人工实现 |
| `wontfix` | `wontfix` | 不予处理 |

主标签**必须**出现在每个工单上，作为「是否有人接、走哪条路径」的判定依据。`/triage` 技能按主标签决策流转。

## 项目标签（领域元数据，辅助分流）

主标签是分流轴，项目标签是过滤轴。**项目标签不替代主标签。**

| 标签 | 含义 | 与主标签组合 |
| --- | --- | --- |
| `AI` | AI 处理的 Issue（v0.2+ 流程） | 配合 `ready-for-agent` |
| `PRD` | 需求规格前置 | 配合 `ready-for-agent` 或 `ready-for-human` |
| `bug` | 缺陷 | 配合 `needs-triage`（入口）或 `ready-for-agent`（已诊断） |
| `enhancement` | 改进 | 配合 `ready-for-agent` |
| `前端` | 前端研发任务 | 跨主标签 |
| `后端` | 后端研发任务 | 跨主标签 |
| `全栈` | 前后端联动 | 跨主标签 |

## 使用规则

- 新建工单**至少**打 1 个主标签；项目标签按需附加。
- 主标签变更触发 `/triage` 重新分诊；项目标签变更不影响分诊。
- 历史工单（v0.2 之前）已带项目标签，可补主标签；不可只保留项目标签。

## 修改

主标签与 mattpocock/skills 默认一致，**不要修改**。项目标签由本表维护，扩展时追加一行即可。
