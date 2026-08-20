/**
 * poi-plugin-quest-line 入口
 * 导出规范见 PLAN.md §2.3（实测自 poi-plugin-quest-info-2/src/index.ts）
 */
export const windowMode = false

export { App as reactClass } from './views/App.es'
export { Settings as settingsClass } from './views/Settings.es'
export { reducer } from './redux/reducer.es'

/**
 * 不声明 switchPluginPath：quest-info-2 已经用同一个路径
 * ('/kcsapi/api_get_member/questlist') 抢 tab 焦点，
 * 两个插件都声明会互相打架。本插件是查询工具，不需要自动跳出来。
 */

export const pluginDidLoad = () => {}
export const pluginWillUnload = () => {}
