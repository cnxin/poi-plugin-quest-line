/**
 * poi-plugin-quest-line 入口
 * 导出规范见 PLAN.md §2.3（实测自 poi-plugin-quest-info-2/src/index.ts）
 */
import React from 'react'
import { App } from './views/App.es'
import { Settings } from './views/Settings.es'
import ErrorBoundary from './views/ErrorBoundary.es'

export const windowMode = false

/** 用错误边界包裹，避免单点异常让整个 tab 白屏 */
export const reactClass = (props) => (
  <ErrorBoundary>
    <App {...props} />
  </ErrorBoundary>
)

export const settingsClass = (props) => (
  <ErrorBoundary>
    <Settings {...props} />
  </ErrorBoundary>
)

export { reducer } from './redux/reducer.es'

/**
 * 不声明 switchPluginPath：quest-info-2 已经用同一个路径
 * ('/kcsapi/api_get_member/questlist') 抢 tab 焦点，
 * 两个插件都声明会互相打架。本插件是查询工具，不需要自动跳出来。
 */

let autoUpdateTimer = null

export const pluginDidLoad = () => {
  // 延后执行，避免拖慢插件启用
  autoUpdateTimer = setTimeout(async () => {
    autoUpdateTimer = null
    try {
      // eslint-disable-next-line global-require
      const { maybeAutoUpdate } = require('./lib/data-update.es')
      // eslint-disable-next-line global-require
      const { invalidateDb } = require('./lib/quest-db.es')
      const r = await maybeAutoUpdate()
      if (r?.ok) {
        invalidateDb()
        window.log?.(`任务线：数据已自动更新（${r.updated} 条）`)
      }
    } catch (e) {
      // 自动更新失败不应影响插件使用
    }
  }, 5000)
}

export const pluginWillUnload = () => {
  if (autoUpdateTimer) {
    clearTimeout(autoUpdateTimer)
    autoUpdateTimer = null
  }
}
