/**
 * 达成路径求解：给定目标任务与当前完成情况，算出「还要做哪些、按什么顺序」。
 *
 * 实测规模：661 个任务需要 5 步以上前置，316 个需要 15 步以上，
 * 最长的 D41 需要 85 个前置任务 —— 不给路径玩家无从下手。
 */
import { getDb } from './quest-db.es'

/** 收集目标的全部祖先（含目标自身） */
export function ancestorsWithSelf(targetId, quests) {
  const seen = new Set()
  const stack = [targetId]
  while (stack.length) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const p of quests[cur]?.prereqIds ?? []) stack.push(p)
  }
  return seen
}

/**
 * 计算达成路径。
 *
 * 按「波次」分层：第 1 波是前置已全部满足、**现在就能做**的任务，
 * 做完第 1 波解锁第 2 波，依此类推。比单纯的拓扑序更贴近玩家的实际操作。
 *
 * @param targetId 目标任务
 * @param completed 已完成任务 id 集合
 * @returns {target, waves, total, doneCount, totalInChain, alreadyDone, periodStats, blocked}
 */
export function computeQuestPath(targetId, completed = new Set()) {
  const db = getDb()
  const quests = db.quests
  if (!quests[targetId]) return null

  const chain = ancestorsWithSelf(targetId, quests)
  const need = [...chain].filter((i) => !completed.has(i))
  const doneCount = chain.size - need.length

  // 目标本身已完成
  if (!need.length) {
    return {
      target: targetId,
      waves: [],
      total: 0,
      doneCount,
      totalInChain: chain.size,
      alreadyDone: true,
      periodStats: {},
      blocked: [],
    }
  }

  const done = new Set(completed)
  const remaining = new Set(need)
  const waves = []

  while (remaining.size) {
    // 本波 = 所有前置都不在「待办」里的任务（即前置已完成或已排进更早的波）
    const wave = [...remaining].filter((i) =>
      (quests[i].prereqIds ?? []).every((p) => !remaining.has(p)),
    )
    if (!wave.length) break // 图无环，正常不会走到；防御性退出
    // 同一波内按类别+wikiId 排序，展示更整齐
    wave.sort((a, b) => {
      const ca = quests[a].category ?? ''
      const cb = quests[b].category ?? ''
      if (ca !== cb) return ca < cb ? -1 : 1
      return (quests[a].wikiId ?? '') < (quests[b].wikiId ?? '') ? -1 : 1
    })
    waves.push(wave)
    for (const i of wave) {
      done.add(i)
      remaining.delete(i)
    }
  }

  // 周期分布：告诉玩家路径里有多少是可重复的日常/周常
  const periodStats = {}
  for (const i of need) {
    const p = quests[i].period ?? '单次'
    periodStats[p] = (periodStats[p] ?? 0) + 1
  }

  return {
    target: targetId,
    waves,
    total: need.length,
    doneCount,
    totalInChain: chain.size,
    alreadyDone: false,
    periodStats,
    // 求解异常时的残留（正常为空）
    blocked: [...remaining],
  }
}
