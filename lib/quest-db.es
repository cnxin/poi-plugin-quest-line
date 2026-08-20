/**
 * 静态任务数据加载 + 索引。
 * 数据由 scripts/build-data.mjs 生成，插件启动时一次性读入。
 */
import path from 'path'

const dataDir = path.join(__dirname, '..', 'assets')

let _db = null

function load() {
  if (_db) return _db
  // eslint-disable-next-line global-require
  const raw = require(path.join(dataDir, 'quests.json'))
  // eslint-disable-next-line global-require
  const req = require(path.join(dataDir, 'requirements.json'))

  const quests = raw.quests
  const ids = Object.keys(quests)
    .map(Number)
    .sort((a, b) => a - b)

  // wikiId -> id，便于按 wiki 编号搜索
  const byWiki = {}
  for (const id of ids) {
    const w = quests[id].wikiId
    if (w) byWiki[w] = id
  }

  _db = {
    meta: raw.meta,
    quests,
    ids,
    byWiki,
    ctype: req.ctype,
    country: req.country,
    rewardNames: req.rewardNames,
    names: req.names ?? {},
  }
  return _db
}

export const getDb = () => load()
export const getQuest = (id) => load().quests[id]
export const getAllIds = () => load().ids

/**
 * 向上收集全部前置（祖先），带深度上限保护。
 * 返回 Set<id>，不含自身。
 */
export const collectAncestors = (id, limit = 200) => {
  const db = load()
  const seen = new Set()
  const stack = [...(db.quests[id]?.prereqIds ?? [])]
  while (stack.length && seen.size < limit) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const p of db.quests[cur]?.prereqIds ?? []) {
      if (!seen.has(p)) stack.push(p)
    }
  }
  return seen
}

/** 向下收集全部后继（子孙） */
export const collectDescendants = (id, limit = 200) => {
  const db = load()
  const seen = new Set()
  const stack = [...(db.quests[id]?.unlocks ?? [])]
  while (stack.length && seen.size < limit) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const n of db.quests[cur]?.unlocks ?? []) {
      if (!seen.has(n)) stack.push(n)
    }
  }
  return seen
}
