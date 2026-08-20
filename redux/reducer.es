/**
 * 插件 reducer。
 *
 * ⚠ ext store 陷阱（PLAN.md §6.4）：poi 的 extendReducer 会把本 reducer 包成
 *   combineReducers({_: reducer})，数据实际落在 store.ext['poi-plugin-quest-line']._
 *   取数请用 selectors.es 里的 selector，不要手写路径。
 *
 * ⚠ 不要写 ext key 'poi-plugin-quest-info'（已被两个现役插件争用，PLAN.md §2.5）
 *
 * 持久化：游戏 API 不提供历史完成记录，因此领奖记录(clearedIds)与
 * 见过的任务(seenIds)必须跨会话累积，否则「已完成/可接取」判断会退化。
 */
const CONFIG_KEY = 'plugin.poi-plugin-quest-line'

/** 安全读取 poi 配置；非 poi 环境返回默认值 */
function loadPersisted() {
  try {
    // eslint-disable-next-line no-undef
    const cfg = typeof config !== 'undefined' ? config : window.config
    return {
      clearedIds: cfg.get(`${CONFIG_KEY}.clearedIds`, []) || [],
      seenIds: cfg.get(`${CONFIG_KEY}.seenIds`, []) || [],
    }
  } catch (e) {
    return { clearedIds: [], seenIds: [] }
  }
}

function persist(key, value) {
  try {
    // eslint-disable-next-line no-undef
    const cfg = typeof config !== 'undefined' ? config : window.config
    cfg.set(`${CONFIG_KEY}.${key}`, value)
  } catch (e) {
    // 非 poi 环境（测试）忽略
  }
}

const persisted = loadPersisted()

const initialState = {
  /** 游戏返回的任务列表，api_no -> quest detail */
  questList: {},
  /** 最近一次 questlist 的 tab id */
  tabId: null,
  /** 最近一次更新时间 */
  updatedAt: 0,
  /** 领取过奖励的任务 id（持久化累积） */
  clearedIds: persisted.clearedIds,
  /** 曾在游戏任务列表中出现过的任务 id（持久化累积，用于祖先反推） */
  seenIds: persisted.seenIds,
}

/** 合并去重，返回新数组；无变化时返回原数组以避免无谓重渲染 */
function mergeIds(prev, incoming) {
  const set = new Set(prev)
  let changed = false
  for (const id of incoming) {
    if (!set.has(id)) {
      set.add(id)
      changed = true
    }
  }
  return changed ? [...set] : prev
}

export function reducer(state = initialState, action) {
  switch (action.type) {
    case '@@Response/kcsapi/api_get_member/questlist': {
      const list = action.body?.api_list
      if (!Array.isArray(list)) return state
      const questList = { ...state.questList }
      const ids = []
      for (const q of list) {
        // api_list 中未占用的槽位是 -1
        if (!q || typeof q !== 'object' || !q.api_no) continue
        questList[q.api_no] = q
        ids.push(q.api_no)
      }
      const seenIds = mergeIds(state.seenIds, ids)
      if (seenIds !== state.seenIds) persist('seenIds', seenIds)
      return {
        ...state,
        questList,
        seenIds,
        tabId: action.postBody?.api_tab_id ?? state.tabId,
        updatedAt: Date.now(),
      }
    }

    case '@@Response/kcsapi/api_req_quest/clearitemget': {
      const id = Number(action.postBody?.api_quest_id)
      if (!id) return state
      const questList = { ...state.questList }
      delete questList[id]
      const clearedIds = mergeIds(state.clearedIds, [id])
      if (clearedIds !== state.clearedIds) persist('clearedIds', clearedIds)
      return { ...state, questList, clearedIds, updatedAt: Date.now() }
    }

    case '@@Response/kcsapi/api_req_quest/stop': {
      const id = Number(action.postBody?.api_quest_id)
      if (!id) return state
      const questList = { ...state.questList }
      delete questList[id]
      return { ...state, questList, updatedAt: Date.now() }
    }

    default:
      return state
  }
}

export default reducer
