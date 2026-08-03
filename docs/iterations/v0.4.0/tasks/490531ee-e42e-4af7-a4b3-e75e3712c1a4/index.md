# 实现页面分段收集器与带缓存的并发翻译池

任务文档索引。

| 文档 | 说明 |
|---|---|
| [DESIGN.md](./DESIGN.md) | 架构、数据契约、关键设计决策、接口依赖 |
| [PLAN.md](./PLAN.md) | TDD 执行计划与绿色边界 |
| [CHANGELOG.md](./CHANGELOG.md) | 改动与验证记录 |

## 产出

- `shared/fullpage/types.ts`、`segmenter.ts`、`translate-pool.ts` + 单测
- 供 t3（渲染器）/ t5（编排器）消费的库模块
