# poi 任务线插件 `poi-plugin-quest-line` — 开发执行方案

> **本文档是自包含的执行手册。** 所有关键事实均来自实测（kanxy 二进制/数据解析、poi 本地安装源码、竞品包内源码），
> 接手的模型/开发者**不需要重新调研**，按本文档执行即可。
> 若与本文档记载不符，以实际代码为准并**更新本文档**。
>
> 创建日期：2026-08-20 ｜ 状态：**M1 已完成（数据管线 + 插件骨架 + 奖励渲染，全部自检通过）**，M2 待开始
>
> **验证命令**（改动后务必全跑，四项须全绿）：
> ```powershell
> cd D:\projects\poi-plugin-quest-line
> node scripts/build-data.mjs      # 数据管线（--offline 跳过联网 / --verify-only 只检查）
> node scripts/selfcheck.mjs       # 数据完整性自检
> node scripts/syntax-check.mjs    # .es 语法检查（poi 现场转译，语法错误否则只在运行时暴露）
> node scripts/test-reducer.mjs    # reducer 纯逻辑测试
> ```

---

## 0. 一句话目标

在 poi 中做一个任务插件，核心卖点是**完整任务线（DAG）可视化 + 结构化奖励查询**，
数据底座来自 kanxy 工具的静态数据（比 poi 生态现有数据多 117 个任务且奖励是结构化的）。

---

## 1. 背景与已完成的勘探结论（M0，已完成）

### 1.1 kanxy 是什么、任务系统怎么实现的

来源：`C:\Users\42008\Downloads\Telegram Desktop\kanxy v1.32\kanxy v1.32`（网友分享的舰C工具，闭源）

三层架构（已通过二进制字符串提取 + JS 源码阅读确认）：

| 层 | 实现 | 证据 |
|---|---|---|
| MITM 代理 | `Kanxy.exe`（C#，Titanium.Web.Proxy）拦截 `/kcsapi` | 二进制含 `api_get_member/questlist`、`api_req_quest/start`、`api_req_quest/clearitemget`、`Files/quest.csv` |
| 客户端注入 | 把游戏 `kcs2/js/main.js` 换成注入版，hook webpack 模块 | `Files/main.js.kai/QuestBonus.js` hook `QuestListItem.ListItem` 的 `_onMouseOver`，经 `ws://localhost` 把任务 ID 发给 C# 端换取奖励文本 |
| 静态数据 | `Files/*.csv|json` | 见下 |

**结论：它的 MITM+注入架构对 poi 毫无价值**（poi 本身就是宿主，拦截与状态推算都是现成的）。
**有价值的只有静态数据**，且数据与实现完全解耦，可直接移植。

### 1.2 数据资产（已抢救归档）

原始文件已从易失的 Telegram 下载目录复制到项目内：

```
D:\projects\poi-plugin-quest-line\data\raw\kanxy\
  quest.csv                405,709 B   768 个任务主表
  QuestRequirements.json    66,000 B   348 条编成要求 DSL
  QuestRewardName.json       1,987 B   useitem ID → 中文名
  ctype.json                 3,198 B   128 个舰型(船体级别)
  SHIP_COUNTRY.json          4,338 B   ctype → 国籍（JSON5，含 // 注释，不能直接 JSON.parse）
D:\projects\poi-plugin-quest-line\data\
  quests.normalized.json   714,134 B   M0 产出的归一化任务图（参考实现，可直接复用）
```

**`quest.csv` 字段（表头为中文，注意编码 UTF-8）：**

| 列 | 含义 | 备注 |
|---|---|---|
| `#内部ID` | **游戏的 `api_no`，唯一主键** | 768 个，全唯一 |
| `wikiID` | wiki 编号如 `A1`/`F140`/`2604B3` | ⚠ **不可作主键**：10 行为空 + `2604B3` 重复 |
| `任务名` | 日文原名 | |
| `更新日期` | 如 `2026/4/23` | 数据更新到 2026-04 |
| `前置任务` | **wikiID 逗号分隔**，如 `F138,F140` | 任务线来源 |
| `任务说明` | 日文，含 `<br>` | |
| `资源奖励` | `[油,弹,钢,铝]` JSON 数组 | |
| `固定奖励` | JSON 数组，元素 `{api_count, api_mst_id, api_kind}` | |
| `选择奖励` | **二维** JSON 数组（多组可选），元素多一个 `api_no`（组内序号），可能含 `api_slotitem_level` | |

**`api_kind` 语义（实测分布）：** `11`=舰娘(6) `12`=装备(176) `13`=道具(461) `14`=家具(20) `18`=补给(7)

**`QuestRequirements.json` 的 DSL 词汇表（已完整解出，共 8 个键）：**

```
大于等于(499) 舰(464) 位置(145) 等于(40) 舰型(17) 小于等于(9) 国籍(8) 等级(4)
```

- `舰`：舰种缩写（`DD`/`CL`/`CV`/`CVB`/`SS`…）**或**具体舰名（`雪風`/`長門`…），共 309 种 token
- `舰型`：ctype ID 数组，如 `[91,87]` → 查 `ctype.json`
- `国籍`：如 `["日","英"]` → 查 `SHIP_COUNTRY.json`
- `位置`：`1` 表示旗舰位
- 结构：`{ID: <api_no>, 要求: [ {条件1}, {条件2} ]}`，多条件为 **AND**

示例（ID 237）：
```json
{"ID":237,"要求":[
  {"舰":["長門","陸奥"],"大于等于":2},
  {"舰":["CA","CAV"],"大于等于":2},
  {"舰":["DD"],"大于等于":3},
  {"小于等于":5}]}
```

### 1.3 数据质量验证（已跑脚本验证，可信）

- 768 任务，前置引用 **零悬空、零环**
- DAG：**1042 条边**、43 个起点任务、284 个终点任务、317 个多前置任务
- **最长任务链 26 级**（终点 `F46` 喷式战斗机开发线）
- 所有奖励 JSON 可解析；useitem 名称表 **零缺漏**

### 1.4 与 poi 生态现有数据的量化对比（关键差异化依据）

对比对象：本机已装 `poi-plugin-quest-info-2@0.15.12` 的 `build/` 内置数据

| 数据源 | 任务数 | 前置链 | 奖励格式 | 编成要求 |
|---|---|---|---|---|
| **kanxy** | **768** | ✅ 完整 DAG | ✅ **结构化 JSON** | ✅ **336 条 DSL** |
| kcanotify-gamedata (scn) | 651 | ❌ | ❌ 纯文本 `"➣驱逐舰「白雪」"` | ❌ |
| kcwikizh/kcQuests (scn) | 644 | ✅ `pre` 字段 | ❌ 纯文本 | ❌ |
| prePostQuest.json | 637 | ✅ pre/post | — | ❌ |

- kanxy 比 kcanotify **多 123 个任务**（含 2026 年最新的 `1124`–`1165`）
- kcanotify 有 **6 个** kanxy 没有的 → **两边必须合并，不能单取**
- kanxy 独有：**375 条结构化选择奖励** + **336 条编成要求 DSL**

---

## 2. poi 插件机制（本地实测确认，非二手资料）

### 2.1 环境现状（本机已验证）

```
poi 实际版本：11.1.0  ⚠ 不是调研假设的 12.x（app.asar LastWrite 2025-11-06）
poi 安装目录：C:\Program Files\poi\resources\app.asar
  → 需读 poi 源码时：npx @electron/asar extract "C:\Program Files\poi\resources\app.asar" <目标目录>
poi 插件目录：C:\Users\42008\AppData\Roaming\poi\plugins\node_modules\
node v24.13.0 ｜ npm 11.6.2
已装 30 个插件，其中任务相关两个（⚠ 冲突风险，见 2.5）：
  poi-plugin-quest-info    v6.1.0   （旧版，2020-09 停更，main: dist/index.js）
  poi-plugin-quest-info-2  v0.15.12 （现役，main: src/index.ts）
```

**poi 11.1.0 实际依赖版本（实测，与通用调研有出入，写代码前以此为准）：**

| 包 | 版本 | 注意 |
|---|---|---|
| react | 18.3.1 | 不是 19 |
| react-redux | **8.1.3** | 不是 9 |
| redux | **4.2.1** | 不是 5；无 RTK |
| reselect | **4.1.8** | 不是 5 |
| styled-components | 6.1.18 | |
| @blueprintjs/core | **5.10.0** | ⚠ **不支持 `compact` 属性**（5.11+/6.x 才有），Card/Callout 上用了会泄漏到 DOM |
| @blueprintjs/select | 5.1.2 | |
| react-window | 1.8.11 | |

**poi 的插件加载机制（实读 `views/services/plugin-manager/` 确认）：**

1. 发现：`glob(plugins/node_modules/poi-plugin-*)` —— **Junction/符号链接可被正常匹配**（已实测）
2. 校验：`readPlugin()` 读 package.json，解析 `realpathSync` 后的真实路径，
   `lstatSync().isSymbolicLink()` 为真则标 `linkedPlugin`
3. 加载：`enablePlugin()` 对**真实路径** `require()`；
   **失败不会消失，而是标记 `isBroken: true` 并在插件列表中显示为损坏**
4. 转译：`views/env.js` 里 `@babel/register`，`extensions: ['.es','.ts','.tsx']`，
   preset 含 env/react/typescript + styled-components 插件
5. 模块解析：`lib/module-path.js` 的 `setAllowedPath` 把 poi 的 `node_modules` 与 ROOT
   **前置**到解析链 —— 因此插件即使在 D 盘也能解析到 poi 自带的 react/blueprint 等依赖
   （已实测：无需在插件内自装运行时依赖）
6. 注册：读取插件后会**重写 `plugins/package.json` 的 dependencies**
   —— 可据此判断 poi 是否成功识别了某插件

**排查插件不显示的手段（本次诊断沉淀）：**
- 看 `plugins/package.json` 里有没有你的包名 → 有 = poi 已识别
- `%AppData%\poi\log.log` 可能是多年前的陈旧文件，**不可靠**
- 真正的错误在 poi 内置 DevTools 的 Console（`Ctrl+Shift+I`），`enablePlugin` 的 catch 会 `console.error`
- 离线复现：解包 asar 后用其 `babel-register.config.js` + `setAllowedPath` 再 require 插件真实路径
  （脚本见 `D:\Temp\poi-asar\repro-real2.js` / `render-test.js`）
- ⚠ **复现时不要手动注入 `NODE_PATH`** —— 会掩盖依赖解析问题，得出假阳性结论

### 2.2 插件规范

- 包名**必须**匹配 `poi-plugin-.+`（poi 源码硬校验，否则直接抛错）
- `main` 可**直接指向 `.ts`/`.es`/`.tsx` 源码**，poi 用 pirates+babel 现场转译 → **零构建起步**
- 技术栈：Electron 43（`nodeIntegration:true`，可用 Node API）/ React **18** / Redux + **@reduxjs/toolkit** / **Blueprint.js** / styled-components 6 / i18next

**`package.json` 的 `poiPlugin` 块：**

```json
{
  "name": "poi-plugin-quest-line",
  "main": "index.es",
  "poiPlugin": {
    "title": "Quest Line",
    "description": "任务线与奖励查询",
    "icon": "fa/sitemap",
    "priority": 3,
    "i18nDir": "./i18n",
    "apiVer": {}
  }
}
```

| 字段 | 说明 |
|---|---|
| `title` | tab 显示名，存在于 i18n 则自动翻译 |
| `priority` | 菜单排序，越小越靠前，缺省 10000（quest-info-2 占用 2，**本插件用 3 避让**） |
| `icon` | FontAwesome **4** 名，格式 `fa/xxx` |
| `i18nDir` | 缺省探测 `./i18n`、`./assets/i18n` |
| `apiVer` | `{"<poiVer>":"<pluginVer>"}` 版本回滚映射 |

### 2.3 入口导出（**本机实读 quest-info-2 `src/index.ts` 确认**）

```ts
export const windowMode = false
export const pluginDidLoad = () => {}      // 启用回调
export const pluginWillUnload = () => {}   // 禁用回调（清理 observer/定时器）
export { App as reactClass } from './App'          // 导出即自动成为一个 tab
export { Settings as settingsClass } from './Settings'  // ⚠ 是 settingsClass 带 s
export { reducer } from './reducer'
export const switchPluginPath = ['/kcsapi/api_get_member/questlist']  // 收到该响应自动切到本 tab
```

生命周期：启用 = import → 读 package.json → 挂 reducer → `pluginDidLoad` → 挂载 UI；
禁用 = `pluginWillUnload` → 卸载 UI → 移除 reducer 并**清空插件 store** → 清 require 缓存。
**改代码后在插件设置里 disable/enable 即热重载。**

### 2.4 数据访问

**读 poi 全局状态：**
```ts
import { getStore } from 'views/create-store'   // window.getStore 已 @deprecated
getStore('info.quests')
```

**`store.info.quests` 结构（poi 已替你做好实时推算，不要自己造轮子）：**
```ts
interface QuestsState {
  records: Record<string|number, QuestRecord>       // 子目标进度推算
  activeQuests: Record<string|number, ActiveQuest>  // 进行中任务 {detail, time}
  questGoals: Record<string|number, QuestGoal>      // 静态目标(quest_goal.cson)
  activeCapacity: number   // 并行上限 api_parallel_quest_count
  activeNum: number        // api_exec_count
}
```
枚举：`QuestState {Unselected=1, InProgress=2, Completed=3}`（`api_state`）；
`QuestProgressFlag {None=0, Half=1, Most=2}`（`api_progress_flag`，<50% / 50%+ / 80%+）。
周期重置：poi 按 UTC+4（`Asia/Yerevan`，等效日本 5:00 重置）；季度用"田中历"（2 月起算）。

**监听游戏 API（在自己的 reducer 里匹配 action.type）：**
```ts
case '@@Response/kcsapi/api_get_member/questlist':   // body.api_list, postBody.api_tab_id
case '@@Response/kcsapi/api_req_quest/clearitemget': // postBody.api_quest_id（领奖）
case '@@Response/kcsapi/api_req_quest/stop':         // 放弃任务
```
action 形状：`{type, method, path, body, postBody, payload:{...}}`。
（备选 DOM 事件 `window.addEventListener('game.response', e => e.detail.path/body)`，仅非 UI 场景用。）

**⚠ ext store 的 `_` 陷阱：** `extendReducer` 会把 reducer 包成 `combineReducers({_: yourReducer})`，
数据实际在 `store.ext['poi-plugin-quest-line']._`。**用 `extensionSelectorFactory(key)` 取数**，它已封装该细节。

**其他工具：** `window.log/warn/error/success`、`window.notify`、`window.toast`、`window.config.get/set`、常量 `ROOT`/`APPDATA_PATH`/`POI_VERSION`。

### 2.5 ⚠ 冲突风险（必须遵守）

1. 本机**同时装了** `quest-info` 与 `quest-info-2`，两者 `title`/`icon`/`priority:2` 完全相同。
   本插件**必须**用不同 `title`/`icon`，`priority` 用 `3`。
2. poi 内置任务面板会读 `store.ext['poi-plugin-quest-info'].quests[api_no]` 的 `{condition, wiki_id}`。
   该 ext key **已被真实的旧插件和 quest-info-2 争用**。
   → **M1–M3 一律不要碰这个 key。** 若 M4 要增强内置面板，必须先检测另两个插件是否启用，
     参考 `poi-plugin-quest-info-2/src/patch.ts` 的做法，且默认关闭该功能。
3. 定位上本插件是 quest-info-2 的**补充**（任务线可视化），不做重复的任务浏览/搜索大而全。

---

## 3. 目标产物

```
D:\projects\poi-plugin-quest-line\
├── package.json
├── index.es                    # 入口（导出见 2.3）
├── data/
│   ├── raw/kanxy/*             # ✅ 已归档的原始数据（勿删）
│   └── quests.normalized.json  # ✅ M0 参考产物
├── scripts/
│   └── build-data.mjs          # 数据管线：raw → assets/
├── assets/
│   ├── quests.json             # 构建产物：归一化任务图
│   └── requirements.json       # 构建产物：编成要求 + ctype/country 查表
├── redux/
│   ├── reducer.es
│   └── selectors.es            # reselect：静态图 ⨯ 实时状态
├── views/
│   ├── App.es                  # reactClass
│   ├── Settings.es             # settingsClass
│   ├── QuestGraph.es           # 任务链视图（核心）
│   └── QuestDetail.es          # 奖励明细
├── i18n/{zh-CN,zh-TW,ja-JP,en-US,ko-KR}.json
└── README.md
```

---

## 4. 里程碑与任务分解

> 每个任务给出**做什么 / 完成判据**。完成一项就在本文档打勾并提交。

### M1 数据管线 + 插件骨架 ✅ **已完成（2026-08-20）**

- [x] **T1.1 初始化包**：`package.json` 就绪，`main: "index.es"`，零构建。
  - ✅ 包名合规、`priority: 3` 避让 quest-info-2
- [x] **T1.2 `scripts/build-data.mjs`** —— 实跑结果：
  - kanxy 768 + 公开源并入 6 = **774 个任务**；**653 个套用中文名**
  - **边 1042 / 悬空 0 / 环 0 / 最长链 26 级**（F46 喷气式歼击轰炸机的开发）—— 与 M0 基线一致
  - 重复 wikiID `2604B3` 按更新日期取新（采用 971）
  - 产出 `assets/quests.json`(774) + `assets/requirements.json`(ctype 128 / country 135)
  - 支持 `--offline`（跳过联网降级）与 `--verify-only`
- [x] **T1.3 插件骨架**：`index.es` 按 §2.3 导出；`views/App.es` 左列表（自实现虚拟滚动，
  搜索覆盖任务名/wikiID/说明/**奖励名**）+ 右详情；已 `npm link` 进 poi（Junction 生效）
- [x] **T1.4 奖励渲染**：`lib/reward.es` 处理 5 种 `api_kind`
  （实测分布 11:24 / 12:706 / 13:1585 / 14:24 / 18:7）；
  道具查本地表（**零缺失**），舰/装备查 `store.const`；选择奖励按组渲染
- [x] **附加**：`redux/reducer.es` + `selectors.es`（三态推断）、5 个 i18n locale、
  三个验证脚本（selfcheck / syntax-check / test-reducer）

**M1 遗留（M2/M3 处理）：**
- 「已完成」状态只能从 questlist 的 `api_state===3` 与本会话领奖记录推断，
  **是下界不是全量历史**（游戏 API 不提供历史完成记录）。已在 `selectors.es` 注释说明。
  M3 需考虑持久化累积（`window.config` 或自建 store）以逼近真实。
- 21 个任务无说明：kanxy 原始 csv 与公开源**均无数据**（已下架的周年/期间限定任务），
  属数据源固有缺失，非 bug。自检阈值设为 ≤25。

### M1.5 用户反馈修复 ✅ **已完成（2026-08-20）**

用户实测后报告 4 个问题，均已修复：

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 任务信息不如 quest-info-2 齐全 | UI 展示过简 | 详情页加类别/周期/期间限定徽章、日文原名、任务说明分区 |
| 2 | 无分类，全混在一起 | 未利用 wikiID 蕴含的分类信息 | 新增 `category`/`period` 字段 + 三行筛选条 |
| 3 | **奖励显示为编号** | **设计错误**：依赖运行时 `store.const.$ships/$equips`，但它**只在游戏加载后才有值**且是日文 → 706 处装备奖励退化成 `装备#123` | **构建期烘焙** start2.json 名称表，运行时 store 降为兜底 |
| 4 | 任务线不完整 | 只显示直接前后置 | 新增 `QuestChain.es`：BFS 分层展开完整上下游，默认各 2 层可逐层展开 |

**新增数据源：**
- `data/raw/kanxy/start2.json`（2MB）—— 游戏主数据，舰 1674 / 装备 721 / 道具 103，
  对奖励 ID **覆盖率 100%**（19 舰 + 287 装备零缺失）
- `data/raw/community/questCategory.json` —— 社区维护的周期分类表，用于校准 wikiID 推导

**分类/周期推导（`parseWikiId`）** —— wikiID 格式比预想复杂，实测有 5 种形态：
```
A1        类别字母 + 序号
Bd1       类别 + 周期字母 + 序号
2604B3    年月前缀 + 类别 + 序号          (期间限定)
L2606C2   L + 年月 + 类别 + 序号          (期间限定)
WA01/SN06 活动/特殊任务  ｜ ''  10 个无 wikiID
```
- 类别：`A`编成 `B`出击 `C`演习 `D`远征 `E`补给/入渠 `F`工厂 `G`改装，其余归「其他」
- 周期：`d`日常 `w`周常 `m`月常 `q`季常 `y`年常 `s/u`特殊，无字母则单次
- 纯 wikiID 推导准确率 ~95%，**用社区表 `questCategory.json` 校准**后达标
- 实测分布：类别 编成95/出击333/演习78/远征48/补给4/工厂162/改装19/其他35；
  周期 单次615/日常24/周常21/月常18/季常28/年常55/特殊13

**新增回归防线：** 管线自检加「奖励名称可解析率 ≥99%」，当前 **2346/2346 = 100%**。
`D:\Temp\poi-asar\verify-fixes.js` 针对这 4 个问题做端到端验证。

验证样例（截图中的 Bm8，与 quest-info-2 显示一致且更全）：
```
[Bm8] (月任) 确保后勤线!强化实施海上警备   类别=出击 周期=月常 深度=7
选择奖励1: 资材 x4 / 桶 x4 / 螺丝 x2
选择奖励2: 九五式爆雷 / 25mm単装機銃 x2 / 伊良湖
前置: B6, Cm1    后续: Bq11
```

**已知局限：** 舰名/装备名来自 start2.json 是**日文**（如「25mm単装機銃」）。
poi 未内置中文资源翻译（那来自未安装的 translator 插件），
社区中文名数据源（kcwiki kcdata / KC3Kai lang）本次探测**全部 404**，
如需中文装备名，M4 再找可用源或解析 kcanotify 的 `rewards` 文本。

### M1.6 审计修复 + 界面重做 ✅ **已完成（2026-08-20）**

**严重缺陷：状态推断失效（已修）**

实测发现 **92.6% 的任务永远显示「未解锁」**，「可接取」几乎等于根任务数。
根因是设计错误：「可接取」定义为「所有前置已完成」，但**游戏 API 不提供历史完成记录**
（poi 自己的 `quest_tracking_*.cson` 也只存进度不存历史），`已完成` 集合近乎空集。

修法（`selectors.es` + `reducer.es`）：
1. **祖先反推**（关键）：任务能出现在 questlist 里 ⟹ 其前置全部满足 ⟹ **所有祖先已完成**
2. **持久化累积**：`clearedIds`（领奖）与 `seenIds`（见过的任务）写入 `window.config`，
   跨会话保留 —— 原本 `recentlyCleared` 只在内存，poi 一重启就归零
3. 无前置的任务天然可接；questlist 中出现过的直接判为已解锁

效果（实测）：见过 120 个任务的场景下，未解锁占比 **92.6% → 68.2%**，
已完成 1 → 72。仍是**下界**（从未在本机出现过的分支无法推断），但已可用。

**其他审计修复：**

| 问题 | 处理 |
|---|---|
| i18n 是死代码（5 个 locale 无人调用） | 改为翻译 `poiPlugin.title`（poi 用 title 作 key 查 i18n），文件真正生效 |
| 发布体积 3.8MB（data/ 占 3.1MB） | package.json 加 `files` 白名单，只发 index/lib/redux/views/assets/i18n |
| 与 quest-info-2 抢 tab 焦点 | **移除 `switchPluginPath`** —— 两插件都声明同一路径会打架 |
| 任务名前缀噪音 203 处 | 构建期 `cleanName()` 剥离 `(月任)`/`【工厂任务】` 等，实测清理 116 条 |
| `data/quests.normalized.json` M0 遗留 | 已删除 |
| 数据加载 815ms | **未修**，M2 再做异步加载+加载态（搜索索引仅 7ms，非瓶颈） |

**界面重做**（用户反馈「界面很糟糕」）：
- 布局从「左右分栏各自带筛选」改为**顶部横跨全宽的筛选区 + 下方列表/详情分栏**
- 筛选片加「类别/周期/状态」行标签，自定义紧凑 `Chip` 替代 Blueprint Button（省一半高度）
- 类别按游戏顺序排列（编成→出击→演习→远征→补给→工厂→改装→**其他垫底**），
  原先「其他」排在第二位
- 列表行左侧加**类别色条**，wikiID 用等宽字体
- **去掉每行的「单次」标签**（615/774 都是单次，纯噪音），只显示周期性任务的周期
- 空态从大块 Callout 改为居中图标+摘要




### M2 奖励反查 + 编成要求判定 ✅ **已完成（2026-08-20）**

- [x] **T2.1 按奖励查任务**（`lib/reward-index.es` + `views/RewardLookup.es`）
  - 聚合 **390 种奖励**、2346 条产出引用；点物品即列出全部产出任务
  - 任务按**前置数量升序**（越容易拿到越靠前），并展示完整前置路径（可点击跳转）
  - 区分「固定奖励」与「选择奖励」（后者需二选一，未必拿得到），分别累计
  - 实测 Top：资材 271 个任务 / 螺丝 202 / 桶 173 / 勋章 109
- [x] **T2.2 编成要求 DSL 求值器**（`lib/fleet-check.es` + `views/FleetReqPanel.es`）
  - 实现全部 8 个 DSL 键；舰名匹配处理改造后缀（`雪風` 匹配 `雪風改二`）
  - 舰种缩写经 `api_stype` 映射（DD/CL/CA/CV/SS…共 22 种）
  - 对照 `state.info.fleets[n]` + `info.ships` + `const.$ships` 实时判定
  - **336 条要求全部可求值**，条件描述无 undefined/NaN
  - 游戏未加载时**只列条件不做判定**，避免全部显示「不满足」误导用户
- [x] **T2.3 模式切换**：主界面顶部加「任务浏览 / 按奖励查任务」两个模式
- [x] **git 初始化**，M1 与 M2 各一次提交

**⚠ 修正前次错误结论：数据加载不是 815ms，实测只有 10.9ms。**
之前的测量把 babel 转译 `.es` 模块的开销算进去了。精确拆分：
```
babel-register 初始化        332 ms
require quest-db.es (转译)   775 ms   ← 之前误记为「数据加载」
getDb() 实际读数据            10.9 ms  ← 真实数据加载
require App.es + 依赖树       3900 ms  (含首次加载 blueprint/styled-components)
getDb() 二次调用              0 ms
```
poi 的 `babel-register.config.js` 设了 **`cache: false`**，所以每次启用插件都要重新转译，
这是 poi `.es`/`.ts` 插件模型的固有成本（quest-info-2 同样如此），**无法在插件侧优化**。
→ 原计划的「数据异步加载」**已取消，没有必要**。

**M2 遗留：**
- 编成要求只对照第 1 舰队，未支持切换舰队（`FleetReqPanel` 已留 `fleetIndex` 参数）
- 舰名/装备名仍是日文（中文源探测全部 404，见 M1.5 局限）

### M3 任务链图形化 ✅ **已完成（2026-08-20）**

任务链从「分层标签」改为 **SVG 绘制的分层 DAG**。

- **布局算法独立为 `lib/chain-layout.es`**（纯函数，与渲染解耦便于单测）
  - 简化 Sugiyama 分层：焦点居中，向上 BFS 得前置层、向下得后继层
  - **重心法（barycenter）**排序减少连线交叉，从焦点层向两端各扫一遍
  - 焦点节点加宽至 `FOCUS_W=168`（普通 116），避免最重要的名字被截断
  - 后继方向排除已在前置侧出现的节点，防止同一节点画两次
- **渲染**（`views/QuestChain.es`）
  - 三次贝塞尔曲线连线；**跨层连线用虚线**区分
  - 节点：左侧类别色条 + 状态描边色 + 焦点蓝框高亮；已完成的降透明度
  - 悬停高亮关联边；`<title>` 提供 tooltip；点击切换焦点
  - 画布可滚动（`max-height: 420px`），支持「展开前置/展开后续」逐层加载

**验证**（`D:\Temp\poi-asar\verify-layout.js` + `verify-chain-svg.js`）：
- 774 个任务全部可布局，**节点零重叠**、集合内前置关系**全部成边**、边均对应真实前置
- 层次方向正确（前置在上、后继在下）；深链 F46 展开到底 65 节点 79 边
- 孤立任务降级为文字提示而非空图
- 目视确认：导出 SVG → Edge headless 截图（`export-svg.js`，可复用）

**踩坑：** 导出脚本注入 `style` 时与组件自带的 `style` 属性重复，
导致 SVG XML 解析失败（浏览器报 duplicate attribute）。**是导出脚本的 bug，非组件问题**，
排查时容易误判为渲染缺陷。

### M3.1 分支过多导致图无法完整显示 ✅ **已修（2026-08-20）**

**根因是扇出（fan-out）而非深度。** 实测数据：

| 展开深度 | 中位宽 | p99 | 最大宽 | 超出面板(560px)占比 |
|---|---|---|---|---|
| 2 | 266 | 2282 | **6188**（单层 49 节点） | 9.6% |
| 4 | 392 | 4550 | **10976**（单层 87 节点） | 23.9% |
| 8 | 392 | 7574 | 10976 | 29.5% |

高度始终正常（最大 510px）。祸首是 hub 型任务：**B6 有 28 个直接后继**、Cd1 有 22 个、Bd2 有 20 个。
（前置方向不是问题，最多才 2 个。）

**三层解决：**
1. **每层限额 `MAX_PER_LAYER = 8`**，其余折叠为可点击的「+N」块，点击展开该层。
   ⚠ **截断必须在 BFS 过程中做，不能事后裁剪** —— 否则被隐藏节点的子节点仍会进入下一层，
   爆炸继续向下级联。实现上截断后要把多余节点从 `seen` 中删除并不纳入 frontier。
2. **画布缩放**：默认自动适应面板宽度（`ResizeObserver` 观测容器，下限 0.4 以免看不清），
   另提供 50%/75%/100% 档位。SVG 用 `viewBox` + 缩放后的 `width/height` 实现。
3. 仍超出时横向滚动。

**效果：最大画布宽度 10976px → 1086px（降 90%）**，单层节点数上限 8，
全部 774 个任务的画布宽度均 ≤1200px。

**测试补充**（`verify-layout.js`）：单层不超限、折叠计数正确、展开后节点增加且无重叠、
**截断不级联**（所有节点都有可见的来源节点）。

**踩坑：** React SSR 会在相邻文本节点间插入 `<!-- -->`，
所以 `+{count}` 渲染成 `+<!-- -->20`，字符串断言 `includes('+20')` 会假失败。
测试里需先 `replace(/<!--[\s\S]*?-->/g, '')`。

### M3.2 任务线拆为独立页面 ✅ **已完成（2026-08-21）**

用户反馈：图嵌在右侧详情面板里只有约 400px 宽，**显示太小、无法拖动、缩小后看不清字**。

**改为三页结构**（顶部 tab 切换）：

| 页面 | 内容 |
|---|---|
| 任务浏览 | 详情里只列**直接**前置/后继（标签形式，`QuestNeighbors.es`），底部「查看完整任务线」按钮跳转 |
| **任务线**（新增 `ChainPage.es`） | 整页显示 DAG，焦点跟随当前选中任务，每层放宽到 **12** 个节点（浏览页原为 8） |
| 按奖励查任务 | 不变 |

**任务线页新增能力：**
- **拖动平移**：直接改容器 `scrollLeft/scrollTop`，比 transform 方案稳。
  ⚠ 节点加 `data-node` 标记，`onMouseDown` 里检测 `e.target.closest('g[data-node]')` 跳过，
  否则点节点会误触发拖动、和点击选择冲突。
  mousemove/mouseup 绑到 window 而非容器，避免拖出容器后卡住。
- 缩放增加 **150%** 档位；`fill` 属性让画布铺满页面高度
- 顶部显示焦点任务信息 + 状态图例（已完成/进行中/可接取/未解锁/虚线=跨层依赖）
- 未选任务时提示「请先选择任务」，而非渲染空图

**效果**：B6 在独立页展开 3 层后继，画布 1590x326，每层 12 个节点字迹清晰，
末尾 `+16`/`+22`/`+12` 可继续展开。同样内容在原 400px 面板里完全塞不下。





### M3 实时状态联动（1–2 天）

- [ ] **T3.1 reducer**：监听 2.4 的三个 action，存增量状态
- [ ] **T3.2 selector**：合并静态图 ⨯ `store.info.quests`，算出
  「已完成 / 进行中 / **当前可接（前置全部完成且未完成）**」三态
- [ ] **T3.3 UI 标记**：图上按三态着色；提供"接下来能做什么"列表
- 判据：游戏内接一个任务，插件 5 秒内反映状态变化

### M4 编成检查 + 发布（2–3 天）

- [ ] **T4.1 DSL 求值器**：实现 1.2 的 8 个键；`舰` token 需同时支持舰种缩写与舰名
  （舰名匹配要处理改造后缀，如 `雪風` 应匹配 `雪風改`）
- [ ] **T4.2 对照现役编成**：读 `store.info.fleets` + `store.info.ships`，实时判定"当前编成是否满足"
- [ ] **T4.3 i18n**：5 个 locale 文件；游戏资源名走 `resources` namespace
- [ ] **T4.4 README + 发布**：注明数据来源与致谢；`npm publish`
- 判据：抽 20 个有 `fleetReq` 的任务人工校验判定正确

---

## 5. 开发与调试流程（固定套路）

```powershell
# 首次：链接插件
cd D:\projects\poi-plugin-quest-line
npm link
cd $env:APPDATA\poi\plugins
npm link poi-plugin-quest-line
# 之后在 poi 的插件设置里启用；改代码后 disable/enable 即热重载
```

- 入口用 `.es`/`.ts` 后缀就**不需要 webpack/vite**
- 调试：poi 内置 Chrome DevTools（`Ctrl+Shift+I`）
- 数据更新：重跑 `node scripts/build-data.mjs`

---

## 6. 硬约束（踩坑清单，务必遵守）

1. **主键用 `#内部ID`（api_no），永远不要用 wikiID**（10 空 + 1 重复）
2. **`SHIP_COUNTRY.json` 是 JSON5**，`JSON.parse` 会炸，先剥 `//` 注释
3. **`quest.csv` 用 UTF-8 读**，Windows 默认 GBK 会乱码
4. **ext store 有 `_` 层**，用 `extensionSelectorFactory` 取数
5. **不要占用 ext key `poi-plugin-quest-info`**（已被两个现役插件争用）
6. **实时进度不要自己算**，读 `store.info.quests`（poi 已处理周期重置/并行上限）
7. React 是 **18** 不是 19；图标是 FontAwesome **4**
8. `settingsClass` **带 s**（旧文档写的 `settingClass` 是错的）
9. 数据源**必须合并** kanxy + kcanotify（各有独有任务）
10. 原始数据在 `data/raw/kanxy/`，**这是唯一副本**（Telegram 下载目录随时可能被清理），勿删
11. **Blueprint 是 5.10.0，不支持 `compact` 属性**；写 UI 前先去
    `D:\Temp\poi-asar\node_modules\@blueprintjs\core` 查实际 API，别照 6.x 文档写
12. **插件改了 package.json（尤其 `poiPlugin` 块）必须重启 poi**，
    改 `.es` 源码则 disable/enable 即可热重载

---

## 7. 数据来源与合规

- kanxy 是网友分享的闭源工具；其 `Files/` 数据本身源自舰C wiki 社区整理。
  **仅移植数据格式与内容作为种子，不复制其任何代码**。
- 发布时须在 README 注明数据来源（kanxy / kcwikizh/kcQuests / antest1/kcanotify-gamedata）并致谢。
- 长期更新应逐步切换到公开源：
  ```
  https://cdn.jsdelivr.net/gh/antest1/kcanotify-gamedata@master/files/quests-scn.json
  https://cdn.jsdelivr.net/gh/kcwikizh/kcQuests@main/quests-scn.json
  ```

---

## 8. 参考资料

- poi 源码：https://github.com/poooi/poi ｜ 开发文档：https://dev.poi.moe/docs/plugin/introduction
- 竞品实现（**本机可直读，最佳参考**）：
  `C:\Users\42008\AppData\Roaming\poi\plugins\node_modules\poi-plugin-quest-info-2\src\`
  （`index.ts` 入口范式、`patch.ts` ext key 注入、`reducer.ts`、`build/` 数据组织）
- kanxy 原始工具：`C:\Users\42008\Downloads\Telegram Desktop\kanxy v1.32\`（易失，数据已归档）
