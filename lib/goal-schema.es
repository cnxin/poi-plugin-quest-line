/**
 * 任务达成条件的数据格式与校验。
 *
 * 语义对齐 poi 的 assets/data/quest_goal.cson —— 这样本插件的扩展条件
 * 既能与 poi 的判定结果共存，将来也可以直接回馈上游。
 *
 * ⚠ 生成的条件如果是错的，比没有更糟：用户会相信一个骗人的进度条。
 * 因此任何新增条件都必须通过本文件的校验，且默认标记为「推测」
 * （confidence: 'inferred'），只有人工核对过才升为 'verified'。
 */

/** poi 支持的事件类型（实测自 quest_goal.cson，不可自造） */
export const EVENTS = new Set([
  'battle',
  'battle_win',
  'battle_rank_s',
  'battle_boss',
  'battle_boss_win',
  'battle_boss_win_rank_a',
  'battle_boss_win_rank_s',
  'sinking',
  'reach_mapcell',
  'practice',
  'practice_win',
  'practice_win_a',
  'practice_win_s',
  'mission_success',
  'create_item',
  'create_ship',
  'destory_item', // poi 源码即此拼写，勿「修正」
  'destroy_ship',
  'remodel_item',
  'remodel_ship',
  'repair',
  'supply',
  'sally',
])

/** 允许的修饰键 */
export const MODIFIERS = new Set([
  'maparea',
  'mapcell',
  'mission',
  'shipType',
  'flagship',
  'flagshiptype',
  'flagshipclass',
  'escortship',
  'escortshiptype',
  'escortshipclass',
  'banshiptype',
  'secondship',
  'fleetlimit',
  'times',
])

/** 海域编号形如 11..17（1-1~1-7）、21..25、…、71..75；活动海域 4x */
const MAPAREA = /^\d{2,3}$/

/**
 * 校验单条任务的条件定义。
 * @returns {ok, errors:[], warnings:[]}
 */
export function validateGoal(questId, goal, quests) {
  const errors = []
  const warnings = []

  if (!quests?.[questId]) {
    errors.push(`任务 ${questId} 不在任务库中`)
    return { ok: false, errors, warnings }
  }
  if (!goal || typeof goal !== 'object') {
    errors.push('条件必须是对象')
    return { ok: false, errors, warnings }
  }

  const subgoals = Object.entries(goal).filter(
    ([k]) => !['type', 'confidence', 'source', 'note'].includes(k),
  )
  if (!subgoals.length) {
    errors.push('至少要有一个子目标')
  }

  for (const [key, cond] of subgoals) {
    const [event, group] = String(key).split('@')
    if (!EVENTS.has(event)) {
      errors.push(`未知事件类型 "${event}"（可用：${[...EVENTS].slice(0, 5).join('/')}…）`)
      continue
    }
    if (!cond || typeof cond !== 'object') {
      errors.push(`${key}: 条件必须是对象`)
      continue
    }
    if (!Number.isInteger(cond.required) || cond.required <= 0) {
      errors.push(`${key}: required 必须是正整数，实际 ${cond.required}`)
    }
    if (cond.init != null && cond.init !== 0) {
      warnings.push(`${key}: init 一般为 0`)
    }
    if (!cond.description) {
      warnings.push(`${key}: 缺少 description（UI 会显示事件名）`)
    }
    for (const mk of Object.keys(cond)) {
      if (['description', 'required', 'init'].includes(mk)) continue
      if (!MODIFIERS.has(mk)) {
        errors.push(`${key}: 未知修饰键 "${mk}"`)
      }
    }
    // maparea 合法性
    for (const m of cond.maparea ?? []) {
      if (!MAPAREA.test(String(m))) errors.push(`${key}: 非法海域编号 ${m}`)
    }
    if (group && /^\d+$/.test(group)) {
      if (!MAPAREA.test(group)) errors.push(`${key}: 分组 @${group} 不是合法海域编号`)
    }
    // 数量与说明的一致性（弱检查，仅提示）
    if (cond.required > 100) {
      warnings.push(`${key}: required=${cond.required} 偏大，请人工确认`)
    }
  }

  // 置信度必须显式声明
  if (!['inferred', 'verified'].includes(goal.confidence)) {
    errors.push("必须声明 confidence 为 'inferred' 或 'verified'")
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** 批量校验，返回统计与逐条问题 */
export function validateAll(goals, quests, poiCovered = new Set()) {
  const result = { total: 0, ok: 0, failed: [], warned: [], conflicts: [] }
  for (const [id, goal] of Object.entries(goals ?? {})) {
    result.total++
    if (poiCovered.has(String(id))) {
      // poi 已有权威定义时不应重复声明，避免两套判定打架
      result.conflicts.push(id)
      continue
    }
    const r = validateGoal(String(id), goal, quests)
    if (r.ok) result.ok++
    else result.failed.push({ id, errors: r.errors })
    if (r.warnings.length) result.warned.push({ id, warnings: r.warnings })
  }
  return result
}
