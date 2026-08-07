# Triage Labels（分流标签）

各技能按五个规范的分流角色来表达工单状态。本文件把这五个角色映射到本仓库工单系统中实际使用的标签字符串。

| mattpocock/skills 中的角色 | 本仓库实际使用的标签 | 含义                     |
| -------------------------- | -------------------- | ------------------------ |
| `needs-triage`             | `needs-triage`       | 维护者还需要评估该工单   |
| `needs-info`               | `needs-info`         | 等待报告人补充信息       |
| `ready-for-agent`          | `ready-for-agent`    | 需求已明确，可交给 Agent |
| `ready-for-human`          | `ready-for-human`    | 需要人工实现             |
| `wontfix`                  | `wontfix`            | 不予处理                 |

当某个技能提到一个角色（例如"打上 AFK-ready 分流标签"），就使用本表对应行的实际标签字符串。

可以随时编辑右列的标签，使其与本仓库实际使用的词汇保持一致。
