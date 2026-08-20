/**
 * 静态任务数据加载 + 索引。
 * 数据由 scripts/build-data.mjs 生成，插件启动时一次性读入。
 */
import path from 'path'
import { readOverride } from './data-update.es'

const dataDir = path.join(__dirname, '..', 'assets')

let _db = null

/**
 * 把在线更新的文本层覆盖到打包数据上。
 * 只覆盖文本字段——结构化数据（前置关系/奖励对象/编成要求）来自 kanxy，
 * 是冻结资产，远端源没有等价物，覆盖会破坏一致性。
 */
function applyOverride(quests, ids) {
  const ov = readOverride()
  if (!ov) return { applied: 0, fetchedAt: 0 }
  let applied = 0
  for (const [key, patch] of Object.entries(ov.quests ?? {})) {
    const q = quests[key]
    if (!q) continue
    let touched = false
    if (patch.name && patch.name !== q.name) {
      q.name = patch.name
      touched = true
    }
    if (patch.desc && patch.desc !== q.desc) {
      q.desc = patch.desc
      touched = true
    }
    if (patch.memo && patch.memo !== q.memo) {
      q.memo = patch.memo
      touched = true
    }
    if (patch.rewardText && !q.rewardText) {
      q.rewardText = patch.rewardText
      touched = true
    }
    if (touched) applied++
  }
  return { applied, fetchedAt: ov.fetchedAt ?? 0 }
}

function load() {
  if (_db) return _db
  // eslint-disable-next-line global-require
  const raw = require(path.join(dataDir, 'quests.json'))
  // eslint-disable-next-line global-require
  const req = require(path.join(dataDir, 'requirements.json'))

  if (!raw || typeof raw.quests !== 'object') {
    throw new Error('assets/quests.json 结构异常，请重装插件或运行 npm run build-data')
  }

  // require 会缓存并共享对象，覆盖前先浅拷贝，避免污染模块缓存
  const quests = {}
  for (const [k, v] of Object.entries(raw.quests)) quests[k] = { ...v }

  const ids = Object.keys(quests)
    .map(Number)
    .sort((a, b) => a - b)

  // 覆盖数据来自网络下载，损坏不应导致插件不可用
  let override = { applied: 0, fetchedAt: 0 }
  try {
    override = applyOverride(quests, ids)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[poi-plugin-quest-line] 应用在线更新失败，回退到随包数据:', e)
  }

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
    override,
  }
  return _db
}

/** 在线更新后调用，使下次 getDb() 重新加载并应用新覆盖 */
export const invalidateDb = () => {
  _db = null
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
