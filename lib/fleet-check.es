/**
 * 编成要求 DSL 求值器。
 *
 * 数据来自 kanxy 的 QuestRequirements.json（336 条），poi 生态无同类数据。
 * DSL 词汇表（实测共 8 个键，见 PLAN.md §1.2）：
 *   舰       舰种缩写(DD/CL/CV…) 或 具体舰名(雪風/長門…)
 *   舰型     ctype ID 数组
 *   国籍     ["日","英"…]
 *   位置     1 = 旗舰位
 *   等级     最低 Lv
 *   大于等于 / 小于等于 / 等于   数量比较
 *
 * 结构：{ID, 要求:[{条件1},{条件2}]}，多条件为 AND。
 */
import { getDb } from './quest-db.es'

/** 舰种 api_stype -> 缩写。stype 见 start2 的 api_mst_stype */
const STYPE_ABBR = {
  1: 'DE', // 海防舰
  2: 'DD', // 驱逐舰
  3: 'CL', // 轻巡
  4: 'CLT', // 重雷装巡洋舰
  5: 'CA', // 重巡
  6: 'CAV', // 航巡
  7: 'CVL', // 轻空母
  8: 'FBB', // 高速战舰
  9: 'BB', // 战舰
  10: 'BBV', // 航战
  11: 'CV', // 正规空母
  12: 'BB', // 超弩级战舰
  13: 'SS', // 潜水舰
  14: 'SSV', // 潜水空母
  15: 'AP', // 补给舰
  16: 'AV', // 水上机母舰
  17: 'LHA', // 扬陆舰
  18: 'CVB', // 装甲空母
  19: 'AR', // 工作舰
  20: 'AS', // 潜水母舰
  21: 'CT', // 练习巡洋舰
  22: 'AO', // 补给舰
}

/**
 * 判断一艘船是否匹配「舰」token。
 * token 可能是舰种缩写，也可能是舰名（需处理改造后缀：雪風 应匹配 雪風改）
 */
function matchShipToken(token, ship, mst) {
  if (!mst) return false
  // 舰种缩写
  const abbr = STYPE_ABBR[mst.api_stype]
  if (token === abbr) return true
  // 特殊：BB 也涵盖 FBB，CV 系列互不包含（按 DSL 原样匹配）
  const name = mst.api_name ?? ''
  if (!name) return false
  // 舰名前缀匹配：「雪風」匹配「雪風改」「雪風改二」
  return name === token || name.startsWith(token)
}

/**
 * 求值单条要求。
 * @param cond DSL 条件对象
 * @param fleet [{ship, mst, level, pos}]  pos 从 1 开始
 */
function evalCondition(cond, fleet) {
  let pool = fleet

  // 位置限制（1 = 旗舰）
  if (cond['位置'] != null) {
    pool = pool.filter((s) => s.pos === cond['位置'])
  }
  // 舰种/舰名
  if (Array.isArray(cond['舰'])) {
    pool = pool.filter((s) => cond['舰'].some((t) => matchShipToken(t, s.ship, s.mst)))
  }
  // 舰型（ctype）
  if (Array.isArray(cond['舰型'])) {
    pool = pool.filter((s) => cond['舰型'].includes(s.mst?.api_ctype))
  }
  // 国籍
  if (Array.isArray(cond['国籍'])) {
    const db = getDb()
    pool = pool.filter((s) => {
      const c = db.country?.[String(s.mst?.api_ctype)]
      return c && cond['国籍'].includes(c)
    })
  }
  // 等级
  if (cond['等级'] != null) {
    pool = pool.filter((s) => (s.level ?? 0) >= cond['等级'])
  }

  const n = pool.length
  if (cond['大于等于'] != null) return { ok: n >= cond['大于等于'], have: n, need: cond['大于等于'], op: '≥' }
  if (cond['小于等于'] != null) return { ok: n <= cond['小于等于'], have: n, need: cond['小于等于'], op: '≤' }
  if (cond['等于'] != null) return { ok: n === cond['等于'], have: n, need: cond['等于'], op: '=' }
  // 无数量约束视为「存在即可」
  return { ok: n > 0, have: n, need: 1, op: '≥' }
}

/** 条件的人类可读描述 */
export function describeCondition(cond) {
  const parts = []
  if (cond['位置'] === 1) parts.push('旗舰')
  if (Array.isArray(cond['舰'])) parts.push(cond['舰'].join('/'))
  if (Array.isArray(cond['舰型'])) {
    const db = getDb()
    parts.push(cond['舰型'].map((c) => db.ctype?.[String(c)] ?? `型${c}`).join('/'))
  }
  if (Array.isArray(cond['国籍'])) parts.push(`${cond['国籍'].join('/')}籍`)
  if (cond['等级'] != null) parts.push(`Lv${cond['等级']}+`)
  const subject = parts.length ? parts.join(' ') : '任意舰'
  if (cond['大于等于'] != null) return `${subject} ≥ ${cond['大于等于']}`
  if (cond['小于等于'] != null) return `${subject} ≤ ${cond['小于等于']}`
  if (cond['等于'] != null) return `${subject} = ${cond['等于']}`
  return subject
}

/**
 * 对照当前舰队求值整条要求。
 * @returns {results: [{cond, desc, ok, have, need, op}], ok: boolean} | null
 */
export function evaluateFleetReq(fleetReq, fleet) {
  if (!Array.isArray(fleetReq) || !fleetReq.length) return null
  const results = fleetReq.map((cond) => ({
    desc: describeCondition(cond),
    ...evalCondition(cond, fleet ?? []),
  }))
  return { results, ok: results.every((r) => r.ok) }
}

/**
 * 从 poi store 取指定舰队的编成。
 * @returns [{ship, mst, level, pos}] ，poi 环境外返回 []
 */
export function readFleet(state, fleetIndex = 0) {
  const fleets = state?.info?.fleets
  const ships = state?.info?.ships
  const consts = state?.const?.$ships
  if (!Array.isArray(fleets) || !fleets[fleetIndex] || !ships) return []
  const out = []
  const shipIds = fleets[fleetIndex].api_ship ?? []
  shipIds.forEach((rosterId, i) => {
    if (rosterId === -1) return
    const ship = ships[rosterId]
    if (!ship) return
    out.push({
      ship,
      mst: consts?.[ship.api_ship_id],
      level: ship.api_lv,
      pos: i + 1,
    })
  })
  return out
}
