/** 校验生成的任务条件定义 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const EVENTS = new Set(['battle','battle_win','battle_rank_s','battle_boss','battle_boss_win','battle_boss_win_rank_a','battle_boss_win_rank_s','sinking','reach_mapcell','practice','practice_win','practice_win_a','practice_win_s','mission_success','create_item','create_ship','destory_item','destroy_ship','remodel_item','remodel_ship','repair','supply','sally'])
const MODS = new Set(['maparea','mapcell','mission','shipType','flagship','flagshiptype','flagshipclass','escortship','escortshiptype','escortshipclass','banshiptype','secondship','fleetlimit','times'])

const f = join(ROOT, 'data/goals/generated.json')
if (!existsSync(f)) { console.error('❌ 尚未生成 data/goals/generated.json'); process.exit(1) }
const goals = JSON.parse(readFileSync(f, 'utf8'))
const quests = JSON.parse(readFileSync(join(ROOT, 'assets/quests.json'), 'utf8')).quests

let errors = 0, ok = 0
const skipped = goals._skipped ?? {}
for (const [id, g] of Object.entries(goals)) {
  if (id === '_skipped') continue
  const e = []
  if (!quests[id]) e.push(`任务 ${id} 不在任务库`)
  if (g.confidence !== 'inferred' && g.confidence !== 'verified') e.push('confidence 必须为 inferred/verified')
  const subs = Object.entries(g).filter(([k]) => !['type','confidence','note','source'].includes(k))
  if (!subs.length) e.push('无子目标')
  for (const [key, c] of subs) {
    const [ev, grp] = key.split('@')
    if (!EVENTS.has(ev)) e.push(`未知事件 "${ev}"`)
    if (!c || typeof c !== 'object') { e.push(`${key} 非对象`); continue }
    if (!Number.isInteger(c.required) || c.required <= 0) e.push(`${key} required 非正整数: ${c.required}`)
    if (c.init !== 0) e.push(`${key} init 必须为 0`)
    for (const k of Object.keys(c)) {
      if (['description','required','init'].includes(k)) continue
      if (!MODS.has(k)) e.push(`${key} 未知修饰键 "${k}"`)
    }
    if (grp && !/^\d{2,3}$/.test(grp)) e.push(`${key} 分组非法海域号`)
    for (const m of c.maparea ?? []) if (!/^\d{2,3}$/.test(String(m))) e.push(`${key} 非法海域 ${m}`)
  }
  if (e.length) { errors++; console.log(`❌ ${id} [${quests[id]?.wikiId ?? '?'}]`); e.forEach(x => console.log('   ', x)) }
  else ok++
}
console.log(`\n通过 ${ok} / 失败 ${errors} / 主动跳过 ${Object.keys(skipped).length}`)
process.exit(errors === 0 ? 0 : 1)
