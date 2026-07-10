# 发布流水线采用 release published 事件触发

v0.3 上线 Chrome/Firefox/Edge 三浏览器自动上架扩展商店。发布流水线需要等待 prodflow-release-deploy 创建 GitHub Release（含 tag、RELEASE-NOTES、Release 对象）后才执行构建与商店上传。我们决定 `release.yml` workflow 用 `on: release [published]`（GitHub Release 发布事件）触发，而非 `on: push [tags: v*]`（tag 推送事件）。这样确保 Release 对象（含聚合好的 RELEASE-NOTES）已由 prodflow-release-deploy 创建完成后才触发流水线；prerelease 通过 `github.event.release.prerelease` 天然区分，prerelease 不上传任何商店；构建产物 zip 作为资产上传到既有 Release 对象，不重复创建 tag/Release。

**状态**: accepted

**考虑过的选项**:

| 方案 | 描述 | 结论 |
|------|------|------|
| A. release published 事件 | `on: release [published]`，GitHub Release 发布后触发 | 采用 - 确保 Release 已就绪、prerelease 天然区分、zip 上传到既有 Release |
| B. push tags 事件 | `on: push [tags: v*]`，tag 推送即触发 | 否决 - tag 推送时 Release 尚未创建，RELEASE-NOTES 未聚合，无法区分 prerelease |
| C. workflow_dispatch 手动触发 | 纯手动触发流水线 | 否决 - 增加人工操作，与 prodflow-release-deploy 自动化流程割裂 |

**后果**:

- 触发契约：prodflow-release-deploy 创建正式 GitHub Release -> `release.yml` 自动触发。tag/RELEASE-NOTES/Release 均由 prodflow-release-deploy 负责，`release.yml` 只消费。
- prerelease 处理：`github.event.release.prerelease === true` 时跳过所有商店 API 上传，仅完成构建与 Release 资产上传。仅正式 Release 进商店上传。
- zip 产物作为 Release 资产上传到 prodflow-release-deploy 已创建的 Release 对象，不重复创建 tag/Release。
- 下游 release-deploy 契约：仅正式 Release 进商店上传，prerelease 不上传。
- 支持 `workflow_dispatch` dry-run 模式（`dry-run=true`）：版本校验 + 三浏览器构建/打包 + Release 资产上传，跳过商店 API。
- 相关文件：`.github/workflows/release.yml`、`releases/v0.3/issue-63/DESIGN.md`、`releases/v0.3/issue-68/DESIGN.md`。
