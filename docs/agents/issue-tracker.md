# Issue tracker: GitHub（工单系统：GitHub）

本仓库的工单和需求规格都以 GitHub Issue 的形式存在。所有操作通过 `gh` CLI 完成。

## 使用约定

- **创建工单**：`gh issue create --title "..." --body "..."`。多行正文请使用 heredoc 写法。
- **查看工单**：`gh issue view <number> --comments`，并通过 `jq` 过滤评论以及读取标签。
- **列出工单**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需配合 `--label` 和 `--state` 过滤。
- **发表评论**：`gh issue comment <number> --body "..."`
- **添加 / 移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭工单**：`gh issue close <number> --comment "..."`

仓库归属由 `git remote -v` 自动推断——在 clone 内运行 `gh` 时无需显式指定。

## Pull requests as a triage surface（PR 作为分流来源）

**PR 作为需求来源：否。**（如果本仓库把外部 PR 视作功能需求，请改为 `yes`；`/triage` 会读取此开关。）

当开关设为 `yes` 时，PR 与 Issue 走同一套标签和状态，使用 `gh pr` 对应命令：

- **查看 PR**：`gh pr view <number> --comments`；diff 用 `gh pr diff <number>`。
- **列出需要分流的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的项（剔除 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 打标 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 Issue 和 PR 共用一个编号空间，所以光给一个 `#42` 可能是其中任意一种——先用 `gh pr view 42` 探测，不是 PR 再回退到 `gh issue view 42`。

## 当某个技能说 "publish to the issue tracker"

创建一个 GitHub Issue。

## 当某个技能说 "fetch the relevant ticket"

执行 `gh issue view <number> --comments`。

## Wayfinding 操作说明

供 `/wayfinder` 使用。一张 **map**（总图）由一个 Issue 充当，下挂多个 **child**（子工单）。

- **Map（总图）**：一个带有 `wayfinder:map` 标签的 Issue，正文包含 Notes / Decisions-so-far / Fog 三段。创建方式 `gh issue create --label wayfinder:map`。
- **Child（子工单）**：以 GitHub sub-issue 形式关联到 map（通过 `gh api` 调用 sub-issues 端点）。如果未启用 sub-issue，则在 map 正文中以任务列表方式加入，并在子工单正文顶部写 `Part of #<map>`。标签使用 `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。被认领后，将子工单指派给实际开发的同学。
- **Blocking（依赖）**：使用 GitHub **原生 issue dependencies**——这是最规范、UI 可见的形式。通过 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` 添加依赖边，其中 `<blocker-db-id>` 是阻塞者的数字 **database id**（用 `gh api repos/<owner>/<repo>/issues/<n> --jq .id` 取到，注意 **不是** `#number` 也不是 `node_id`）。GitHub 在 `issue_dependencies_summary.blocked_by` 中返回当前打开的阻塞者（实时判定依据）。如果原生依赖不可用，则回退为在子工单正文顶部加一行 `Blocked by: #<n>, #<n>`。当所有阻塞工单都已关闭时，子工单视为可推进。
- **Frontier query（前沿查询）**：列出 map 下所有打开的子工单（`gh issue list --state open`，限定在 map 的 sub-issue / 任务列表范围内），剔除存在打开阻塞者（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行中存在未关闭的工单）或已被指派的项；按 map 中的顺序取第一个即为可推进项。
- **Claim（认领）**：`gh issue edit <n> --add-assignee @me`——这是本次会话对该工单的第一次写入。
- **Resolve（解决）**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，最后在 map 的 Decisions-so-far 段追加一条上下文指针（gist 链接等）。
