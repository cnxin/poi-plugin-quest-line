# poi-plugin-quest-line

舰队 Collection 任务线插件 for [poi](https://github.com/poooi/poi)。

以**任务线（DAG）图形化**与**结构化奖励查询**为核心，作为 `poi-plugin-quest-info-2` 的补充。

## 特性

- **达成路径**：选定一个目标任务，结合你当前的完成情况，算出**还要做哪些、按什么顺序**。
  按「步」分组——第 1 步是现在就能做的，做完解锁第 2 步。
  实测 661 个任务需要 5 步以上前置，最长的需要 85 个，没有路径规划基本无从下手。
  支持手动勾选标记已完成，路径实时重算。
- **图形化任务线**：774 个任务的完整前置/后继关系图（1042 条前置边，最长链 26 级），
  可拖动、可缩放、逐层展开，点击节点即可切换焦点
- **按奖励查任务**：想要「螺丝」「甲板」，直接列出所有产出该道具的任务，
  按前置数量升序排列（越容易拿到越靠前），并给出完整前置路径
- **结构化奖励**：资源 / 固定奖励 / 选择奖励分组展示，2346 项奖励名称解析率 100%
- **精确达成条件**：合并社区维护的 `memo2` 数据（覆盖 573 个任务），
  例如 B11 会明确显示「使用『鸟海』…以及任一高速舰 **出击一次**」
- **编成要求判定**：336 条编成要求，可对照当前舰队实时判断是否满足
- **实时状态**：读取 poi 的 `store.info.quests`，标记已完成 / 进行中 / 可接取 / 未解锁
- **数据在线更新**：设置页一键更新，或开启每日自动更新

## 安装

### 方式一：poi 内置插件市场（推荐，发布后可用）

poi → 设置 → 插件 → 搜索 `quest-line` → 安装。

### 方式二：从 npm 安装

在 poi 的插件目录执行：

```bash
# Windows
cd %AppData%\poi\plugins
# macOS
cd ~/Library/Application\ Support/poi/plugins
# Linux
cd ~/.config/poi/plugins

npm install poi-plugin-quest-line
```

重启 poi，在插件设置里启用「任务线」。

### 方式三：安装本地 tarball（无需 npm 账号，适合内部分发）

```bash
cd <poi 插件目录>
npm install /path/to/poi-plugin-quest-line-0.1.0.tgz
```

tarball 可由作者用 `npm pack` 生成。

### 方式四：直接放置源码

把整个仓库（不含 `data/`、`node_modules/`）复制到：

```
<poi 插件目录>/node_modules/poi-plugin-quest-line/
```

poi 用 `glob(plugins/node_modules/poi-plugin-*)` 发现插件，只要目录名匹配
且含合法 `package.json` 即可。入口是 `.es` 源码，由 poi 现场转译，**无需构建**。

> **要求 poi ≥ 11.0.0。** 插件依赖的 react / blueprint / styled-components
> 均由 poi 提供，无需另行安装。

## 开发

```bash
git clone https://github.com/cnxin/poi-plugin-quest-line
cd poi-plugin-quest-line

# 链接进 poi
npm link
cd <poi 插件目录> && npm link poi-plugin-quest-line
```

改 `.es` 源码后，在 poi 插件设置里 disable/enable 即热重载；
改 `package.json` 需重启 poi。

```bash
# 重建打包数据（从 data/raw/ 生成 assets/）
npm run build-data                        # 联网合并中文名与达成条件
node scripts/build-data.mjs --offline     # 离线，仅用本地数据

# 验证（改动后建议全跑）
node scripts/selfcheck.mjs      # 数据完整性
node scripts/syntax-check.mjs   # .es 语法
node scripts/test-reducer.mjs   # reducer 逻辑
```

> `data/raw/` 是构建输入（含游戏主数据与社区整理的原始表），**不随仓库分发**。
> 已构建好的 `assets/` 随包提供，**日常使用与二次开发都无需 `data/raw/`**；
> 只有需要从零重建数据时才用得上。
> 任务文本可通过插件设置页的「立即更新数据」直接从公开 CDN 拉取，无需重新构建。

## 数据来源与致谢

任务数据整理自舰C wiki 社区。本插件仅使用公开数据，**不含任何第三方代码**：

- [kcwikizh/kcQuests](https://github.com/kcwikizh/kcQuests) —— 中文任务名、描述、达成条件
- [antest1/kcanotify-gamedata](https://github.com/antest1/kcanotify-gamedata) —— 多语言任务数据
- 社区整理的任务前置关系与结构化奖励数据

感谢以上项目的维护者，以及 [poi](https://github.com/poooi/poi) 与
[poi-plugin-quest-info-2](https://github.com/lawvs/poi-plugin-quest-2) 的作者。

在线更新只覆盖文本层（任务名 / 说明 / 达成条件），数据直接取自上述公开仓库的 CDN。

## License

MIT
