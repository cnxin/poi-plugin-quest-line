/**
 * 奖励反查索引：聚合全部任务的奖励产出。
 *
 * 用途：回答「我想要螺丝/甲板/女神，该做哪些任务」，
 * 并给出每个任务的完整前置路径。这是本插件相对 quest-info-2 的核心差异
 * —— 它的奖励是纯文本，无法聚合查询。
 */
import { getDb, collectAncestors } from './quest-db.es'
import { describeReward } from './reward.es'

let _index = null

/** 奖励种类 -> 排序权重，让常用的消耗品排前面 */
const KIND_ORDER = { 13: 0, 12: 1, 11: 2, 18: 3, 14: 4 }

function build() {
  const db = getDb()
  /** key: `${kind}:${mstId}` -> {kind, mstId, name, quests:[{id,count,choice}], total, choiceTotal} */
  const map = new Map()

  const add = (o, questId, isChoice) => {
    const d = describeReward(o)
    if (!d) return
    const key = `${d.kind}:${d.mstId}`
    let e = map.get(key)
    if (!e) {
      e = {
        key,
        kind: d.kind,
        mstId: d.mstId,
        name: d.name,
        quests: [],
        total: 0, // 固定奖励累计（确定能拿到）
        choiceTotal: 0, // 选择奖励累计（需二选一，未必拿得到）
      }
      map.set(key, e)
    }
    e.quests.push({ id: questId, count: d.count, choice: isChoice })
    if (isChoice) e.choiceTotal += d.count
    else e.total += d.count
  }

  for (const id of db.ids) {
    const q = db.quests[id]
    for (const o of q.fixedReward ?? []) add(o, id, false)
    for (const group of q.choiceReward ?? []) {
      for (const o of Array.isArray(group) ? group : [group]) add(o, id, true)
    }
  }

  const items = [...map.values()].sort((a, b) => {
    const ko = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    if (ko) return ko
    return b.quests.length - a.quests.length
  })
  _index = { items, byKey: map }
  return _index
}

export const getRewardIndex = () => _index ?? build()

/** 模糊搜索奖励条目 */
export function searchRewards(keyword) {
  const idx = getRewardIndex()
  const kw = (keyword ?? '').trim().toLowerCase()
  if (!kw) return idx.items
  return idx.items.filter((e) => e.name.toLowerCase().includes(kw))
}

/**
 * 某个奖励条目对应的任务，附带完整前置路径。
 * 按「前置链长度」升序 —— 越容易拿到的排越前。
 */
export function questsForReward(key) {
  const db = getDb()
  const e = getRewardIndex().byKey.get(key)
  if (!e) return []
  return e.quests
    .map((ref) => {
      const q = db.quests[ref.id]
      if (!q) return null
      const ancestors = collectAncestors(ref.id)
      return {
        ...ref,
        quest: q,
        pathLength: ancestors.size,
        // 前置路径按链深度排序，形成「先做什么后做什么」的顺序
        path: [...ancestors].sort((a, b) => (db.quests[a]?.depth ?? 0) - (db.quests[b]?.depth ?? 0)),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.pathLength - b.pathLength)
}
