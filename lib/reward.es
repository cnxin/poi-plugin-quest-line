/**
 * 奖励解析：把 quest.csv 的结构化奖励对象翻译成可读文本。
 *
 * api_kind 语义（实测分布，见 PLAN.md §1.2）：
 *   11=舰娘(6) 12=装备(176) 13=道具(461) 14=家具(20) 18=补给(7)
 *
 * 舰/装备名从 poi 的 store.const.$ships/$slotitems 取（自带 i18n），
 * 道具名查本地 QuestRewardName.json。
 */
import { getDb } from './quest-db.es'

export const RESOURCE_LABELS = ['燃料', '弹药', '钢材', '铝土']

const kindFallback = {
  11: '舰娘',
  12: '装备',
  13: '道具',
  14: '家具',
  18: '补给',
}

/** 安全地从 poi store 取常量表；poi 环境外或游戏未加载时返回空对象 */
function getConst() {
  try {
    // eslint-disable-next-line global-require
    const { getStore } = require('views/create-store')
    return {
      ships: getStore('const.$ships') || {},
      slotitems: getStore('const.$equips') || {},
    }
  } catch (e) {
    return { ships: {}, slotitems: {} }
  }
}

/**
 * 单个奖励对象 -> {name, count, kind, level}
 *
 * 名称解析优先级：
 *   1. 构建期烘焙的 start2 名称表（离线可用，覆盖率 100%）
 *   2. poi 运行时 store.const（游戏加载后才有值）
 *   3. 编号兜底
 * 之所以以烘焙表为主：store.const 只在游戏加载后填充，
 * 否则 706 处装备奖励会全部退化成「装备#123」。
 */
export function describeReward(o) {
  if (!o || typeof o !== 'object') return null
  const { api_kind: kind, api_mst_id: mstId, api_count: count } = o
  const level = o.api_slotitem_level
  const db = getDb()
  const baked = db.names ?? {}
  const id = String(mstId)

  let name
  switch (kind) {
    case 11:
      name = baked.ships?.[id] || getConst().ships[mstId]?.api_name
      break
    case 12:
      name = baked.items?.[id] || getConst().slotitems[mstId]?.api_name
      break
    case 13:
      name = db.rewardNames?.['13']?.[id] || baked.useitems?.[id]
      break
    case 14:
      name = `家具`
      break
    case 18:
      name = baked.useitems?.[id] || '补给'
      break
    default:
      name = undefined
  }
  if (!name) {
    name = `${kindFallback[kind] ?? '奖励'}#${mstId}`
  }

  return {
    kind,
    mstId,
    name,
    count: count ?? 1,
    level: level || 0,
  }
}

/** "螺丝 x6" / "12.7cm连装炮 ★4 x2" */
export function rewardToText(o) {
  const d = describeReward(o)
  if (!d) return ''
  const star = d.level ? ` ★${d.level}` : ''
  const n = d.count > 1 ? ` x${d.count}` : ''
  return `${d.name}${star}${n}`
}

/** 资源奖励 [油,弹,钢,铝] -> [{label, value}]，跳过 0 */
export function describeResource(resource) {
  if (!Array.isArray(resource)) return []
  return resource
    .map((v, i) => ({ label: RESOURCE_LABELS[i] ?? `#${i}`, value: v }))
    .filter((x) => x.value)
}

/** 固定奖励数组 -> 文本数组 */
export function describeFixed(fixedReward) {
  if (!Array.isArray(fixedReward)) return []
  return fixedReward.map(rewardToText).filter(Boolean)
}

/**
 * 选择奖励是二维数组：外层是「可选组」，内层是该组包含的物品。
 * -> [[text, ...], [text, ...]]
 */
export function describeChoice(choiceReward) {
  if (!Array.isArray(choiceReward)) return []
  return choiceReward
    .map((group) =>
      (Array.isArray(group) ? group : [group]).map(rewardToText).filter(Boolean),
    )
    .filter((g) => g.length)
}

/** 供搜索用：任务的全部奖励名拼成一个可搜索字符串 */
export function rewardSearchText(quest) {
  const parts = []
  for (const t of describeFixed(quest.fixedReward)) parts.push(t)
  for (const g of describeChoice(quest.choiceReward)) parts.push(...g)
  if (quest.rewardText) parts.push(quest.rewardText)
  return parts.join(' ')
}
