# poi-plugin-quest-line

舰队 Collection 任务线插件 for [poi](https://github.com/poooi/poi)。

以**任务线（DAG）可视化**与**结构化奖励查询**为核心，作为 `poi-plugin-quest-info-2` 的补充。

## 特性

- **774 个任务**的完整前置/后继关系图（1042 条边，最长任务链 26 级）
- **结构化奖励**：资源、固定奖励、选择奖励分组展示，而非纯文本
- **按奖励搜索**：想要「螺丝」「甲板」，直接搜出所有产出该道具的任务
- **实时状态**：读取 poi 的 `store.info.quests`，标记已完成 / 进行中 / 可接取 / 未解锁
- 336 条编成要求数据（DSL 求值器规划中）

## 开发

```bash
# 构建数据（从 data/raw/ 生成 assets/）
npm run build-data              # 联网合并中文名
node scripts/build-data.mjs --offline    # 离线，仅用本地数据

# 验证（改动后四项都要跑）
node scripts/selfcheck.mjs      # 数据完整性
node scripts/syntax-check.mjs   # .es 语法
node scripts/test-reducer.mjs   # reducer 逻辑
```

安装到 poi：

```bash
npm link
cd %AppData%/poi/plugins && npm link poi-plugin-quest-line
```

入口用 `.es` 后缀，由 poi 现场转译，**无需 webpack/vite**。改代码后在 poi 插件设置里
disable/enable 即热重载。

完整开发方案见 [PLAN.md](./PLAN.md)。

## 数据来源与致谢

任务数据整理自舰C wiki 社区，本插件仅使用数据、不含任何第三方代码：

- kanxy 工具的静态数据文件（社区整理，含 2026 年最新任务与结构化奖励）
- [kcwikizh/kcQuests](https://github.com/kcwikizh/kcQuests)
- [antest1/kcanotify-gamedata](https://github.com/antest1/kcanotify-gamedata)

感谢以上项目的维护者。

## License

MIT
