/**
 * 目标达成提醒。
 *
 * 收藏的目标从「未解锁」变成「现在可做」或「已达成」时提醒一次。
 * 只观察状态变化并调用 poi 的通知接口，不做任何游戏侧操作。
 */
import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { getDb } from '../lib/quest-db.es'
import { computeQuestPath } from '../lib/quest-path.es'
import { completedIdsSelector, favoritesSelector } from '../redux/selectors.es'
import { primaryName } from '../lib/quest-name.es'

/** 调 poi 的通知；非 poi 环境静默忽略 */
function notify(text) {
  try {
    window.notify?.(text, { title: '任务线' })
  } catch (e) {
    /* ignore */
  }
  try {
    window.success?.(text)
  } catch (e) {
    /* ignore */
  }
}

/**
 * @param lang 标题语言
 * @param enabled 是否启用提醒
 */
export function useGoalNotifier(lang = 'ja', enabled = true) {
  const favorites = useSelector(favoritesSelector)
  const completed = useSelector(completedIdsSelector)
  /** 上一轮每个目标的状态快照，用于识别「刚刚变化」 */
  const prev = useRef(new Map())
  /** 首轮不提醒，否则一启用就把历史状态全播一遍 */
  const primed = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const db = getDb()
    const next = new Map()

    for (const id of favorites) {
      const q = db.quests[id]
      if (!q) continue
      const path = computeQuestPath(id, completed)
      if (!path) continue
      // 状态：done=已达成 ready=第一步就是目标本身（前置齐了） pending=还早
      const state = path.alreadyDone
        ? 'done'
        : path.waves[0]?.includes(Number(id))
          ? 'ready'
          : 'pending'
      next.set(id, state)

      if (primed.current) {
        const before = prev.current.get(id)
        if (before && before !== state) {
          if (state === 'done') {
            notify(`目标达成：${primaryName(q, lang)}`)
          } else if (state === 'ready') {
            notify(`前置已完成，现在可以做：${primaryName(q, lang)}`)
          }
        }
      }
    }

    prev.current = next
    primed.current = true
  }, [favorites, completed, lang, enabled])
}

export default useGoalNotifier
