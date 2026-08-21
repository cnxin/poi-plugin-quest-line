/**
 * 任务进度解析。
 *
 * **本模块只读取 poi 已经算好的数据，不自行拦截或统计游戏事件，
 * 更不会向游戏发送任何请求。**
 *
 * poi 内置的 `assets/data/quest_goal.cson` 定义了 104 个任务的达成条件，
 * 并由其 QuestEvent 系统在战斗/远征/开发等响应到达时累加，结果存在
 * `store.info.quests.records`。它支持的判定维度（实测自 quest_goal.cson）：
 *
 *   battle / battle_win / battle_rank_s        出击与胜利次数
 *   battle_boss / battle_boss_win              BOSS 战
 *   battle_boss_win_rank_s / _rank_a           BOSS 战 S/A 胜（可按海域分别计数）
 *   sinking (shipType)                         击沉指定舰种
 *   reach_mapcell / mapcell                    到达指定点
 *   practice / practice_win / _win_s / _win_a  演习
 *   mission_success (mission)                  远征成功（可指定远征编号）
 *   create_item / create_ship                  装备开发 / 舰船建造
 *   destory_item / destroy_ship                装备废弃 / 舰船解体
 *   remodel_item / remodel_ship                改修 / 改造
 *   repair / supply / sally                    入渠 / 补给 / 出击
 *
 * 修饰键：maparea（海域）、mapcell、mission、shipType、
 * flagship/flagshiptype/flagshipclass、escortship/escortshiptype、
 * banshiptype、fleetlimit、times。
 *
 * 子目标可用 `事件@分组` 形式分别计数，例如
 *   'battle_boss_win_rank_s@12': { count, required, description: '1-2 S' }
 * 这正是「在不同阶段分别完成指定海域的击破次数」——poi 已经实现，
 * 本插件负责把它展示出来。
 *
 * 覆盖边界（实测）：日常 95.8% / 周常 90.5% / 季常·年常 ~67% / **单次 0%**。
 * 单次任务是二元的，用手动标记即可，不需要计数。
 */

/** record 里这些是汇总字段，不是子目标 */
const META_KEYS = new Set(['id', 'count', 'required', 'active', 'time'])

/**
 * 本插件补充的达成条件（poi 未收录的重复性任务）。
 *
 * ⚠ 这些条件是**从任务说明推断**的（confidence: inferred），
 * 且本插件**不自行统计事件**——poi 只会为它自己收录的任务累加计数，
 * 所以这里的补充条件目前只用于**告知玩家达成要求**，不产生进度数字。
 * 想让它们真正计数，需要把定义提交到 poi 上游的 quest_goal.cson。
 */
let _extra = null
function extraGoals() {
  if (_extra) return _extra
  try {
    // eslint-disable-next-line global-require
    const path = require('path')
    // eslint-disable-next-line global-require
    _extra = require(path.join(__dirname, '..', 'assets', 'extra-goals.json')).goals ?? {}
  } catch (e) {
    _extra = {}
  }
  return _extra
}

/** 把补充条件转成「要求说明」列表（无计数，仅告知） */
export function describeExtraGoal(id) {
  const g = extraGoals()[String(id)]
  if (!g) return null
  const items = []
  for (const [key, cond] of Object.entries(g)) {
    if (['type', 'confidence', 'note', 'source'].includes(key)) continue
    if (!cond || typeof cond !== 'object') continue
    const maps = (cond.maparea ?? []).map((m) => {
      const s = String(m)
      return `${s.slice(0, -1)}-${s.slice(-1)}`
    })
    items.push({
      key,
      description: cond.description ?? key,
      required: cond.required,
      maps,
    })
  }
  return items.length ? { items, confidence: g.confidence, note: g.note } : null
}

/**
 * 把 poi 的 record 拆成可渲染的子目标列表。
 * @returns null（无追踪数据）或 {total:{count,required}, subgoals:[{key,event,group,description,count,required,done}]}
 */
export function parseProgress(record) {
  if (!record || typeof record !== 'object') return null

  const subgoals = []
  for (const [key, val] of Object.entries(record)) {
    if (META_KEYS.has(key)) continue
    if (!val || typeof val !== 'object' || val.required == null) continue
    const [event, group] = String(key).split('@')
    const count = val.count ?? 0
    const required = val.required ?? 0
    subgoals.push({
      key,
      event,
      group: group ?? null,
      description: val.description ?? event,
      count,
      required,
      done: required > 0 && count >= required,
    })
  }

  const total = {
    count: record.count ?? subgoals.reduce((n, g) => n + g.count, 0),
    required: record.required ?? subgoals.reduce((n, g) => n + g.required, 0),
  }
  if (!subgoals.length && !total.required) return null

  return {
    total,
    subgoals,
    done: total.required > 0 && total.count >= total.required,
    // 单一子目标时不必重复展示汇总
    singleGoal: subgoals.length === 1,
  }
}

/** 该任务是否有自动追踪（即 poi 的 quest_goal 是否收录） */
export function hasTracking(records, id) {
  return parseProgress(records?.[id]) != null
}

/**
 * 活动/限时道具。这些是 useitem，数量直接来自 store.info.useitems，
 * 无需自行统计。id 取自 kanxy 的 QuestRewardName 表。
 */
export const EVENT_ITEMS = [
  { id: 68, name: '秋刀鱼' },
  { id: 93, name: '沙丁鱼' },
  { id: 62, name: '菱饼' },
  { id: 90, name: '节分豆' },
  { id: 96, name: '南瓜' },
  { id: 80, name: '圣诞礼物' },
  { id: 85, name: '大米' },
  { id: 86, name: '梅干' },
  { id: 87, name: '海苔' },
  { id: 88, name: '茶' },
  { id: 89, name: '凤翔晚餐券' },
  { id: 97, name: '晴天娃娃' },
  { id: 98, name: '海色缎带' },
  { id: 99, name: '白襻' },
  { id: 66, name: '饭团' },
  { id: 69, name: '罐头' },
]

/** 常用消耗品，和活动道具一起展示便于对照任务需求 */
export const COMMON_ITEMS = [
  { id: 1, name: '高速修复材' },
  { id: 2, name: '高速建造材' },
  { id: 3, name: '开发资材' },
  { id: 4, name: '改修资材' },
  { id: 57, name: '勋章' },
  { id: 58, name: '设计图' },
  { id: 65, name: '战斗详报' },
  { id: 78, name: '战斗详报' },
]

/**
 * 从 poi store 读道具数量。
 * ⚠ poi 源码注明 useitem 接口不完整、更新未必及时，数值仅供参考。
 */
export function readItemCounts(state, list) {
  const items = state?.info?.useitems ?? {}
  return list
    .map((it) => ({ ...it, count: items[it.id]?.api_count ?? 0 }))
    .filter((it) => it.count > 0)
}
