/**
 * Selectors：合并静态任务图与 poi 的实时任务状态。
 *
 * 实时状态一律读 poi 的 store.info.quests（poi 已处理进度推算/周期重置/并行上限），
 * 不要自己造轮子（PLAN.md §6.6）。
 */
import { createSelector } from 'reselect'
import { getDb, collectAncestors } from '../lib/quest-db.es'

export const PACKAGE_NAME = 'poi-plugin-quest-line'

/** 本插件的 ext state（已处理 `_` 层） */
export const pluginSelector = (state) => state?.ext?.[PACKAGE_NAME]?._ ?? {}

/** poi 的任务状态 */
export const poiQuestsSelector = (state) => state?.info?.quests ?? {}

/** 任务状态四态 */
export const STATUS = {
  COMPLETED: 'completed',
  IN_PROGRESS: 'inProgress',
  AVAILABLE: 'available', // 已解锁但未接取
  LOCKED: 'locked', // 前置未满足
}

/**
 * api_state: 1=未选择(可接) 2=进行中 3=已完成待领取
 * 见 PLAN.md §2.4
 */
const QuestState = { Unselected: 1, InProgress: 2, Completed: 3 }

/**
 * 已完成任务集合。
 *
 * 游戏 API **不提供历史完成记录**，只能推断。四个来源：
 *   1. 用户**手动标记**（manualDone）—— 补上推断不到的部分，权威度最高
 *   2. 持久化累积的领奖记录（clearitemget，跨会话保留）
 *   3. questlist 中 api_state === 3（已达成待领取）
 *   4. **祖先反推**：任务能出现在 questlist 里，说明它的前置全部满足，
 *      因此其所有祖先任务必然已完成。这是覆盖历史记录缺口的关键手段
 *      —— 否则 92.6% 的任务会永远显示「未解锁」。
 *
 * 仍是**下界**：从未在本机出现过、也未手动标记的分支无法推断。
 */
export const completedIdsSelector = createSelector([pluginSelector], (ext) => {
  const done = new Set(ext.clearedIds ?? [])
  for (const id of ext.manualDone ?? []) done.add(Number(id))
  const seenInGame = []

  for (const [id, q] of Object.entries(ext.questList ?? {})) {
    const n = Number(id)
    if (q?.api_state === QuestState.Completed) done.add(n)
    seenInGame.push(n)
  }
  // 历史上见过的任务也参与反推（跨会话累积）
  for (const id of ext.seenIds ?? []) seenInGame.push(Number(id))

  // 祖先反推
  for (const id of seenInGame) {
    for (const anc of collectAncestors(id)) done.add(anc)
  }
  // 已领奖 / 手动标记的任务，其祖先同样已完成
  for (const id of [...(ext.clearedIds ?? []), ...(ext.manualDone ?? [])]) {
    for (const anc of collectAncestors(Number(id))) done.add(anc)
  }
  return done
})

/** 手动标记的集合，供 UI 区分「推断的」与「用户确认的」 */
export const manualDoneSelector = createSelector(
  [pluginSelector],
  (ext) => new Set((ext.manualDone ?? []).map(Number)),
)

/** 进行中任务 id 集合 */
export const inProgressIdsSelector = createSelector(
  [pluginSelector, poiQuestsSelector],
  (ext, poiQuests) => {
    const s = new Set()
    for (const [id, q] of Object.entries(ext.questList ?? {})) {
      if (q?.api_state === QuestState.InProgress) s.add(Number(id))
    }
    for (const id of Object.keys(poiQuests.activeQuests ?? {})) s.add(Number(id))
    return s
  },
)

/** 当前在游戏任务列表中出现过的任务（= 已解锁，可接取） */
export const unlockedIdsSelector = createSelector([pluginSelector], (ext) => {
  const s = new Set()
  for (const id of Object.keys(ext.questList ?? {})) s.add(Number(id))
  for (const id of ext.seenIds ?? []) s.add(Number(id))
  return s
})

/**
 * 每个任务的状态映射 id -> STATUS
 * 优先级：已完成 > 进行中 > 已解锁(可接取) > 前置满足(可接取) > 未解锁
 */
export const questStatusSelector = createSelector(
  [completedIdsSelector, inProgressIdsSelector, unlockedIdsSelector],
  (completed, inProgress, unlocked) => {
    const db = getDb()
    const status = {}
    for (const id of db.ids) {
      if (inProgress.has(id)) {
        status[id] = STATUS.IN_PROGRESS
      } else if (completed.has(id)) {
        status[id] = STATUS.COMPLETED
      } else if (unlocked.has(id)) {
        status[id] = STATUS.AVAILABLE
      } else {
        const pre = db.quests[id].prereqIds ?? []
        status[id] = pre.length && pre.every((p) => completed.has(p))
          ? STATUS.AVAILABLE
          : pre.length
            ? STATUS.LOCKED
            : STATUS.AVAILABLE // 无前置的任务天然可接
      }
    }
    return status
  },
)

/** poi 对某任务的进度推算（子目标 count/required） */
export const questProgressSelector = createSelector(
  [poiQuestsSelector, (_, id) => id],
  (poiQuests, id) => poiQuests.records?.[id] ?? null,
)
