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
      manualDone: cfg.get(`${CONFIG_KEY}.manualDone`, []) || [],
      favorites: cfg.get(`${CONFIG_KEY}.favorites`, []) || [],
      // 默认用日文原名做主标题：与游戏内显示一致，便于对照
      titleLang: cfg.get(`${CONFIG_KEY}.titleLang`, 'ja') || 'ja',
      followGame: cfg.get(`${CONFIG_KEY}.followGame`, true),
    }
  } catch (e) {
    return {
      clearedIds: [],
      seenIds: [],
      manualDone: [],
      favorites: [],
      titleLang: 'ja',
      followGame: true,
    }
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
  /**
   * 用户手动标记为已完成的任务 id（持久化）。
   * 游戏 API 不提供历史完成记录，自动推断只是下界，
   * 这里让玩家补上推断不到的部分。
   */
  manualDone: persisted.manualDone,
  /** 收藏的目标任务 id（持久化）。用户可同时盯多条任务线的进展 */
  favorites: persisted.favorites,
  /** 主标题语言：'ja' 日文原名（与游戏一致）/ 'zh' 中文 */
  titleLang: persisted.titleLang,
  /** 游戏内接任务时是否自动跳转到该任务 */
  followGame: persisted.followGame,
  /**
   * 游戏内最近接取的任务及其时间戳。
   * 时间戳用于让 UI 区分「同一个任务被再次接取」，
   * 否则重复接同一任务不会触发跳转。
   */
  lastStarted: null,
  lastStartedAt: 0,
}

/** 手动标记/取消标记某任务为已完成 */
export const toggleManualDone = (id) => ({
  type: '@@poi-plugin-quest-line/toggleManualDone',
  id: Number(id),
})

/** 清空全部手动标记 */
export const clearManualDone = () => ({
  type: '@@poi-plugin-quest-line/clearManualDone',
})

/** 收藏/取消收藏某个目标任务 */
export const toggleFavorite = (id) => ({
  type: '@@poi-plugin-quest-line/toggleFavorite',
  id: Number(id),
})

/** 切换主标题语言 */
export const setTitleLang = (lang) => ({
  type: '@@poi-plugin-quest-line/setTitleLang',
  lang: lang === 'zh' ? 'zh' : 'ja',
})

/** 开关「游戏内接任务时自动跳转」 */
export const setFollowGame = (on) => ({
  type: '@@poi-plugin-quest-line/setFollowGame',
  on: !!on,
})

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

    case '@@poi-plugin-quest-line/toggleManualDone': {
      const id = Number(action.id)
      if (!id) return state
      const has = state.manualDone.includes(id)
      const manualDone = has
        ? state.manualDone.filter((x) => x !== id)
        : [...state.manualDone, id]
      persist('manualDone', manualDone)
      return { ...state, manualDone }
    }

    case '@@poi-plugin-quest-line/clearManualDone': {
      if (!state.manualDone.length) return state
      persist('manualDone', [])
      return { ...state, manualDone: [] }
    }

    /**
     * 游戏内接取任务。这是「点击任务后插件自动跳转」的信号源
     * —— 游戏点击本身不发请求，但接取会发 api_req_quest/start。
     */
    case '@@Response/kcsapi/api_req_quest/start': {
      const id = Number(action.postBody?.api_quest_id)
      if (!id) return state
      const seenIds = mergeIds(state.seenIds, [id])
      if (seenIds !== state.seenIds) persist('seenIds', seenIds)
      return {
        ...state,
        seenIds,
        lastStarted: id,
        lastStartedAt: Date.now(),
        updatedAt: Date.now(),
      }
    }

    case '@@poi-plugin-quest-line/toggleFavorite': {
      const id = Number(action.id)
      if (!id) return state
      const has = state.favorites.includes(id)
      const favorites = has
        ? state.favorites.filter((x) => x !== id)
        : [...state.favorites, id]
      persist('favorites', favorites)
      return { ...state, favorites }
    }

    case '@@poi-plugin-quest-line/setTitleLang': {
      if (state.titleLang === action.lang) return state
      persist('titleLang', action.lang)
      return { ...state, titleLang: action.lang }
    }

    case '@@poi-plugin-quest-line/setFollowGame': {
      if (state.followGame === action.on) return state
      persist('followGame', action.on)
      return { ...state, followGame: action.on }
    }

    default:
      return state
  }
}

export default reducer
