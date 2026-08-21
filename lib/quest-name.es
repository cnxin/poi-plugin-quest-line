/**
 * 任务显示名称。
 *
 * 默认用**日文原名**作主标题：插件里的名字要能和游戏内一一对上，
 * 中文译名各数据源措辞不一，单看标题容易对不上号。
 * 中文名降为副标题，搜索两者都能命中。
 *
 * 6 个期间限定任务（L2606*、B216）没有日文原名，自动回退到中文。
 */

/** 主标题 */
export function primaryName(quest, lang = 'ja') {
  if (!quest) return ''
  if (lang === 'zh') return quest.name || quest.nameJa || ''
  return quest.nameJa || quest.name || ''
}

/** 副标题；与主标题相同时返回空（避免重复显示） */
export function secondaryName(quest, lang = 'ja') {
  if (!quest) return ''
  const primary = primaryName(quest, lang)
  const other = lang === 'zh' ? quest.nameJa : quest.name
  if (!other || other === primary) return ''
  return other
}

/** 搜索用文本：两种语言都要能命中 */
export function searchableName(quest) {
  if (!quest) return ''
  return `${quest.nameJa ?? ''} ${quest.name ?? ''}`
}
