# poi-plugin-quest-line

[![npm](https://img.shields.io/npm/v/poi-plugin-quest-line)](https://www.npmjs.com/package/poi-plugin-quest-line)
[![license](https://img.shields.io/npm/l/poi-plugin-quest-line)](./LICENSE)

舰队 Collection 任务线插件 for [poi](https://github.com/poooi/poi)。

回答两个问题：**「我想要这个奖励，该怎么做？」** 和 **「这个任务要先做完什么？」**

以任务线（DAG）图形化与达成路径规划为核心，作为 `poi-plugin-quest-info-2` 的补充而非替代。

---

## 为什么需要它

实测 774 个任务中，**661 个需要 5 步以上前置，316 个需要 15 步以上**，最长的 D41 要 85 个前置任务。
只看单个任务的说明，你不会知道自己离它还有多远、下一步该做什么。

## 功能

### 四个页面

| 页面 | 用途 |
|---|---|
| **任务浏览** | 按类别/周期/状态筛选，搜索任务名、wiki 编号、说明或奖励；详情含说明、达成条件、进度、奖励、编成要求 |
| **任务线** | 整页 SVG 图形化 DAG，可拖动缩放、逐层展开；另有「我的达成路径」视图 |
| **按奖励查任务** | 选一个奖励物品，列出所有产出它的任务及完整前置路径 |
| **我的目标** | 收藏多条任务线，横向对比各自进度 |

### 达成路径

选定目标任务，结合当前完成情况算出**还要做哪些、按什么顺序**。按「步」分组：

```
距离「噴式戦闘爆撃機の開発」还需完成 57 个任务，分 24 步
整条链共 65 个任务，已完成 8（12%）
待办构成：单次 42 ｜ 周常 8 ｜ 日常 4 ｜ 月常 3

第 1 步 · 现在就能做 (3)
  ☐ Bd1  敵艦隊を撃破せよ！              日常
  ☐ Cd2  「演習」で他提督を圧倒せよ！      日常
  ☐ A5   軽巡２隻を擁する隊を編成せよ！
第 2 步 (2)
  ...
```

第 1 步是前置已满足、**现在就能接**的任务，做完解锁第 2 步。
每项可手动勾选标记已完成，路径实时重算。

### 图形化任务线

774 个任务、1042 条前置边、最长链 26 级。焦点任务居中并自动滚入视野，
前置在上、后继在下，点击任意节点即可切换焦点。

分支多的任务（B6 有 28 个直接后继）每层折叠为「+N」，点击展开；
画布可拖动、可缩放（50%–150%）。

### 任务进度判定

读取 poi 已算好的达成进度（`store.info.quests.records`），
支持出击、海域击破、演习、远征、装备开发/废弃、入渠等维度，
**多海域条件会分别计数**：

```
1-2 S 胜  ████████████  1/1
1-3 S 胜  ░░░░░░░░░░░░  0/1
1-4 S 胜  ░░░░░░░░░░░░  0/1
2-1 S 胜  ░░░░░░░░░░░░  0/1
```

> 进度数据来自 poi 内置的 `quest_goal.cson`，覆盖 104 个任务
> （日常 95.8% / 周常 90.5% / 季常·年常约 67% / 单次 0%），恰好覆盖最需要计数的重复性任务。
> 未收录的任务会明确显示「无自动进度追踪」，不会伪造进度。

### 其他

- **结构化奖励** — 资源 / 固定奖励 / 选择奖励分组展示，2346 项奖励名称解析率 100%
- **精确达成条件** — 合并社区维护的 `memo2`（覆盖 573 个任务），
  例如 B11 明确显示「使用『鸟海』…以及任一高速舰 **出击一次**」
- **编成要求判定** — 336 条编成要求，对照当前舰队实时判断是否满足
- **活动道具数量** — 秋刀鱼、菱饼、节分豆等限时道具持有量
- **目标达成提醒** — 收藏的目标变为「可做」或「已达成」时通知
- **游戏内联动** — 在游戏里接取任务时自动跳转到该任务（可关闭）
- **日文原名优先** — 主标题用日文原名与游戏内一一对应，中文作副标题，搜索两者皆可命中
- **数据在线更新** — 设置页一键更新，或开启每日自动检查

## 安装

**要求 poi ≥ 11.0.0。** react / blueprint / styled-components 均由 poi 提供，无需另装。

### npm（推荐）

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

### 本地 tarball（无需 npm 账号）

```bash
cd <poi 插件目录>
npm install /path/to/poi-plugin-quest-line-x.y.z.tgz
```

### 直接放置源码

把仓库内容（不含 `data/`、`node_modules/`）复制到
`<poi 插件目录>/node_modules/poi-plugin-quest-line/`。

poi 用 `glob(plugins/node_modules/poi-plugin-*)` 发现插件，
只要目录名匹配且含合法 `package.json` 即可。入口是 `.es` 源码，由 poi 现场转译，**无需构建**。

## 隐私与合规

本插件**只读取 poi 已经捕获的游戏响应数据**：

- ❌ 不拦截、不修改任何游戏数据
- ❌ 不向游戏服务器发送任何请求
- ❌ 不执行任何自动化操作
- ✅ 唯一的网络访问是从 jsDelivr CDN 拉取公开的任务文本数据（可在设置中关闭自动更新）

手动标记、收藏等用户数据保存在 poi 的本地配置中，不会上传。

## 开发

```bash
git clone https://github.com/cnxin/poi-plugin-quest-line
cd poi-plugin-quest-line

npm link
cd <poi 插件目录> && npm link poi-plugin-quest-line
```

改 `.es` 源码后在插件设置里 disable/enable 即热重载；改 `package.json` 需重启 poi。

```bash
# 重建打包数据（从 data/raw/ 生成 assets/）
npm run build-data                        # 联网合并中文名与达成条件
node scripts/build-data.mjs --offline     # 离线，仅用本地数据

# 验证
node scripts/selfcheck.mjs       # 数据完整性
node scripts/syntax-check.mjs    # .es 语法
node scripts/test-reducer.mjs    # reducer 逻辑
node scripts/validate-goals.mjs  # 补充达成条件的合法性
```

> `data/raw/` 是构建输入（含游戏主数据与社区整理的原始表），**不随仓库分发**。
> 已构建好的 `assets/` 随包提供，日常使用与二次开发都无需 `data/raw/`。
> 任务文本可通过设置页的「立即更新数据」直接从公开 CDN 拉取，无需重新构建。

## 数据来源与致谢

任务数据整理自舰C wiki 社区。本插件仅使用公开数据，**不含任何第三方代码**：

- [kcwikizh/kcQuests](https://github.com/kcwikizh/kcQuests) —— 中文任务名、描述、精确达成条件
- [antest1/kcanotify-gamedata](https://github.com/antest1/kcanotify-gamedata) —— 多语言任务数据
- 社区整理的任务前置关系与结构化奖励数据

感谢以上项目的维护者，以及 [poi](https://github.com/poooi/poi) 与
[poi-plugin-quest-info-2](https://github.com/lawvs/poi-plugin-quest-2) 的作者。

## License

MIT
