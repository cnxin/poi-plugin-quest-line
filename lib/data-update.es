/**
 * 数据源在线更新。
 *
 * 设计取舍：kanxy 的结构化数据（前置关系、奖励对象、编成要求）是**冻结的静态资产**，
 * 随插件打包；在线更新只覆盖会随游戏更新变化的**文本层**
 * （中文名 / 说明 / 达成条件 / 新任务），以及新增任务的基本信息。
 *
 * 更新结果写入 poi 的 APPDATA 目录，与插件包分离——
 * 这样插件升级不会丢更新，卸载重装也不会残留脏数据。
 */
const REMOTE = {
  kcanotify:
    'https://cdn.jsdelivr.net/gh/antest1/kcanotify-gamedata@master/files/quests-scn.json',
  kcQuests: 'https://cdn.jsdelivr.net/gh/kcwikizh/kcQuests@main/quests-scn.json',
}

const CONFIG_KEY = 'plugin.poi-plugin-quest-line'
const OVERRIDE_FILE = 'quest-line-data.json'

/** 取 poi 的 APPDATA 路径；非 poi 环境回退到系统临时目录 */
function getDataDir() {
  try {
    // eslint-disable-next-line no-undef
    const base = typeof APPDATA_PATH !== 'undefined' ? APPDATA_PATH : window.APPDATA_PATH
    if (base) return base
  } catch (e) {
    /* 非 poi 环境 */
  }
  // eslint-disable-next-line global-require
  return require('os').tmpdir()
}

export function getOverridePath() {
  // eslint-disable-next-line global-require
  const path = require('path')
  return path.join(getDataDir(), OVERRIDE_FILE)
}

/** 读取已下载的覆盖数据；不存在或损坏时返回 null */
export function readOverride() {
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs')
    const p = getOverridePath()
    if (!fs.existsSync(p)) return null
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (!d || typeof d.quests !== 'object') return null
    return d
  } catch (e) {
    return null
  }
}

function cfg() {
  try {
    // eslint-disable-next-line no-undef
    return typeof config !== 'undefined' ? config : window.config
  } catch (e) {
    return null
  }
}

export function getLastUpdated() {
  try {
    return cfg()?.get(`${CONFIG_KEY}.lastUpdated`, 0) ?? 0
  } catch (e) {
    return 0
  }
}

export function getAutoUpdate() {
  try {
    return cfg()?.get(`${CONFIG_KEY}.autoUpdate`, false) ?? false
  } catch (e) {
    return false
  }
}

export function setAutoUpdate(v) {
  try {
    cfg()?.set(`${CONFIG_KEY}.autoUpdate`, !!v)
  } catch (e) {
    /* ignore */
  }
}

async function fetchJson(url, timeoutMs = 20000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * 剥离任务名的周期/类型前缀（如「(月任)」「【工厂任务】」）。
 * UI 已有独立的类别/周期徽章，前缀属重复信息。
 *
 * ⚠ 与 scripts/build-data.mjs 的 cleanName 保持一致 —— 在线更新若不做同样处理，
 * 更新后前缀会重新冒出来（实测踩过）。
 */
const NAME_PREFIX =
  /^[(（【[]\s*(日任|周任|月任|季任|年任|单次|期间限定任务|期間限定任務|期间限定扩张任务|工厂任务|工廠任務|改装任务|出击任务|演习任务|远征任务|编成任务|补给任务)(\s*[\/／].{0,6}?)?\s*[)）】\]]\s*/

function cleanName(name) {
  let s = (name ?? '').trim()
  for (let i = 0; i < 3; i++) {
    const next = s.replace(NAME_PREFIX, '')
    if (next === s) break
    s = next
  }
  return s || name
}

/**
 * 拉取远端数据并写入覆盖文件。
 * @returns {ok, updated, added, error}
 */
export async function updateData() {
  const result = { ok: false, updated: 0, added: 0, sources: [], error: null }
  const remote = {}
  for (const [name, url] of Object.entries(REMOTE)) {
    try {
      remote[name] = await fetchJson(url)
      result.sources.push(name)
    } catch (e) {
      // 单个源失败不致命，只要还有可用源就继续
      result.error = `${name}: ${e.message}`
    }
  }
  if (!result.sources.length) {
    result.error = result.error || '所有数据源均不可达'
    return result
  }

  // 只提取文本层，避免把远端结构写进本地覆盖导致与 kanxy 结构冲突
  const quests = {}
  for (const src of ['kcanotify', 'kcQuests']) {
    const d = remote[src]
    if (!d) continue
    for (const [key, val] of Object.entries(d)) {
      if (!/^\d+$/.test(key)) continue
      const e = (quests[key] = quests[key] ?? {})
      if (val.name && !e.name) e.name = cleanName(String(val.name).trim())
      if (val.desc && !e.desc) e.desc = String(val.desc).trim()
      if (val.memo2 && !e.memo) e.memo = String(val.memo2).trim()
      if (val.code && !e.wikiId) e.wikiId = String(val.code).trim()
      if (val.rewards && !e.rewardText) e.rewardText = String(val.rewards).trim()
      if (Array.isArray(val.pre) && !e.pre) e.pre = val.pre.map(String)
    }
  }

  const payload = {
    version: 1,
    fetchedAt: Date.now(),
    sources: result.sources,
    quests,
  }

  try {
    // eslint-disable-next-line global-require
    const fs = require('fs')
    fs.writeFileSync(getOverridePath(), JSON.stringify(payload), 'utf8')
  } catch (e) {
    result.error = `写入失败: ${e.message}`
    return result
  }

  try {
    cfg()?.set(`${CONFIG_KEY}.lastUpdated`, payload.fetchedAt)
  } catch (e) {
    /* ignore */
  }

  result.ok = true
  result.updated = Object.keys(quests).length
  return result
}

/** 一天检查一次即可，任务数据不会频繁变动 */
const AUTO_INTERVAL = 24 * 60 * 60 * 1000

/** 若开启自动更新且距上次更新超过一天，则在后台静默更新 */
export async function maybeAutoUpdate() {
  if (!getAutoUpdate()) return null
  if (Date.now() - getLastUpdated() < AUTO_INTERVAL) return null
  try {
    return await updateData()
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
