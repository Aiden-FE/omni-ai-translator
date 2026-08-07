# Domain Docs（领域文档）

本文件说明各个工程技能在探索本仓库代码库时，应当如何读取领域文档。

## 探索代码前，先读这些

- 仓库根目录的 **`CONTEXT.md`**；或者
- 如果根目录存在 **`CONTEXT-MAP.md`**，它会指向若干个 `CONTEXT.md`（每个上下文一份）。根据当前主题，读取相关的那些。
- **`docs/adr/`**——阅读与你即将动手的区域相关的 ADR。在多上下文仓库中，还要顺带看 `src/<context>/docs/adr/` 里上下文范围内的决策。

如果上述文件不存在，**保持沉默，直接继续**。不要提示这些文件缺失，也不要主动建议创建。`/domain-modeling` 技能（由 `/grill-with-docs` 和 `/improve-codebase-architecture` 调用）会在真正有术语或决策需要落实时，按需创建。

## 文件结构

单上下文仓库（绝大多数仓库都属于这种）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 跨上下文 / 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文范围内的决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表中的词汇

在你产出的内容中提到领域概念时（工单标题、重构提案、假设、测试名等），请使用 `CONTEXT.md` 中定义的术语。不要切换到术语表明确回避的同义词。

如果需要的概念尚未写进术语表，这是一个信号——要么你在发明项目里没有的词（请重新考虑），要么存在真实的术语缺口（记下来交给 `/domain-modeling` 处理）。

## 提示 ADR 冲突

如果你的产出与现有 ADR 矛盾，请明确指出，不要静默覆盖：

> _与 ADR-0007（event-sourced orders）冲突，但鉴于……值得重新讨论。_
