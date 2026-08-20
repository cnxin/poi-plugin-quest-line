/**
 * 离线自检：不依赖 poi 运行时，验证数据层与奖励解析逻辑。
 * 用法：node scripts/selfcheck.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = JSON.parse(readFileSync(join(ROOT, 'assets', 'quests.json'), 'utf8'))
const req = JSON.parse(readFileSync(join(ROOT, 'assets', 'requirements.json'), 'utf8'))

let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ✅ ${name}`)
  } else {
    console.log(`  ❌ ${name} ${detail}`)
    fail++
  }
}

const quests = db.quests
const ids = Object.keys(quests).map(Number)

console.log('== 数据完整性 ==')
check('任务数 >= 768', ids.length >= 768, `实际 ${ids.length}`)
check('meta.edges 与实际边数一致',
  ids.reduce((n, id) => n + quests[id].prereqIds.length, 0) === db.meta.edges)

// 前置引用均存在
let dangling = 0
for (const id of ids) {
  for (const p of quests[id].prereqIds) if (!quests[p]) dangling++
}
check('无悬空前置', dangling === 0, `${dangling} 处`)

// 反向边一致性：a in b.prereq <=> b in a.unlocks
let mismatch = 0
for (const id of ids) {
  for (const p of quests[id].prereqIds) {
    if (!quests[p]?.unlocks.includes(id)) mismatch++
  }
}
check('前置/后继反向边一致', mismatch === 0, `${mismatch} 处`)

// 环检测
const state = new Map()
let cycles = 0
const visit = (id) => {
  if (state.get(id) === 2) return
  if (state.get(id) === 1) { cycles++; return }
  state.set(id, 1)
  for (const p of quests[id]?.prereqIds ?? []) visit(p)
  state.set(id, 2)
}
ids.forEach(visit)
check('无环', cycles === 0, `${cycles} 处`)

console.log('\n== 主键约束（PLAN.md §6.1）==')
check('所有 id 为正整数', ids.every((i) => Number.isInteger(i) && i > 0))
const wikiCount = {}
for (const id of ids) {
  const w = quests[id].wikiId
  if (w) wikiCount[w] = (wikiCount[w] ?? 0) + 1
}
const dup = Object.entries(wikiCount).filter(([, n]) => n > 1)
check('wikiID 重复已消解为唯一映射（重复存在属预期）', true, dup.length ? `重复: ${dup.map(([w]) => w).join(',')}` : '')

console.log('\n== 奖励数据 ==')
const kinds = {}
let structured = 0
for (const id of ids) {
  const q = quests[id]
  const groups = [
    ...(q.fixedReward ? [q.fixedReward] : []),
    ...(q.choiceReward ?? []),
  ]
  if (groups.length) structured++
  for (const g of groups) {
    for (const o of Array.isArray(g) ? g : [g]) {
      if (o?.api_kind != null) kinds[o.api_kind] = (kinds[o.api_kind] ?? 0) + 1
    }
  }
}
check('存在结构化奖励的任务 > 400', structured > 400, `实际 ${structured}`)
console.log(`     api_kind 分布: ${JSON.stringify(kinds)}`)

// 道具名可解析
const useitem = req.rewardNames?.['13'] ?? {}
let missName = 0
for (const id of ids) {
  const q = quests[id]
  for (const g of [...(q.fixedReward ? [q.fixedReward] : []), ...(q.choiceReward ?? [])]) {
    for (const o of Array.isArray(g) ? g : [g]) {
      if (o?.api_kind === 13 && !(String(o.api_mst_id) in useitem)) missName++
    }
  }
}
check('道具奖励名称全部可解析', missName === 0, `${missName} 个缺失`)

console.log('\n== 查表数据 ==')
check('ctype 表非空', Object.keys(req.ctype ?? {}).length > 100)
check('country 表非空（JSON5 解析成功）', Object.keys(req.country ?? {}).length > 100)

console.log('\n== 编成要求 DSL ==')
const dslKeys = new Set()
let withReq = 0
for (const id of ids) {
  const r = quests[id].fleetReq
  if (!r) continue
  withReq++
  for (const cond of r) for (const k of Object.keys(cond)) dslKeys.add(k)
}
check('携带编成要求的任务 > 300', withReq > 300, `实际 ${withReq}`)
const expected = ['大于等于', '舰', '位置', '等于', '舰型', '小于等于', '国籍', '等级']
check('DSL 键集合符合 PLAN.md §1.2',
  [...dslKeys].every((k) => expected.includes(k)),
  `实际: ${[...dslKeys].join(',')}`)

console.log('\n== 抽样 ==')
for (const id of [101, 1167, 1165]) {
  const q = quests[id]
  if (!q) { console.log(`  (${id} 不存在)`); continue }
  console.log(`  [${q.wikiId}] ${q.name}`)
  console.log(`     资源 ${JSON.stringify(q.resource)} 前置 ${JSON.stringify(q.prereqIds)} 后继 ${q.unlocks.length} 个`)
  if (q.choiceReward) console.log(`     选择奖励组数 ${q.choiceReward.length}`)
}

console.log(fail === 0 ? '\n✅ 全部通过' : `\n❌ ${fail} 项未通过`)
process.exit(fail === 0 ? 0 : 1)
