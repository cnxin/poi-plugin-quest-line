/**
 * 数据管线：data/raw/kanxy/* (+ 远端公开源) -> assets/quests.json, assets/requirements.json
 *
 * 用法：
 *   node scripts/build-data.mjs                # 构建（尝试联网合并中文名，失败则降级）
 *   node scripts/build-data.mjs --offline      # 跳过联网，仅用 kanxy 数据
 *   node scripts/build-data.mjs --verify-only  # 只跑自检，不写文件
 *
 * 硬约束（见 PLAN.md §6）：
 *   - 主键用 quest.csv 的「#内部ID」(= 游戏 api_no)，绝不用 wikiID（10 行为空 + 2604B3 重复）
 *   - quest.csv 必须按 UTF-8 读
 *   - SHIP_COUNTRY.json 是 JSON5（含 // 注释），不能直接 JSON.parse
 *   - kanxy 与 kcanotify 各有独有任务，必须合并
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data', 'raw', 'kanxy')
const OUT = join(ROOT, 'assets')

const argv = process.argv.slice(2)
const OFFLINE = argv.includes('--offline')
const VERIFY_ONLY = argv.includes('--verify-only')

/** M0 实测基线，回归时必须保持（见 PLAN.md §1.3） */
const BASELINE = { minQuests: 768, danglingPrereq: 0, cycles: 0 }

const REMOTE = {
  kcanotify:
    'https://cdn.jsdelivr.net/gh/antest1/kcanotify-gamedata@master/files/quests-scn.json',
  kcQuests: 'https://cdn.jsdelivr.net/gh/kcwikizh/kcQuests@main/quests-scn.json',
}

// ---------------------------------------------------------------- 基础工具

/** 最小 CSV 解析器：支持双引号包裹、"" 转义、字段内换行 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  // 去 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '')
}

/** 剥离 JSON5 风格的 // 行注释（字符串字面量内的 // 不能剥） */
function parseJson5Lite(text) {
  let out = ''
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      out += c
      if (c === '\\') {
        out += text[++i] ?? ''
      } else if (c === '"') {
        inStr = false
      }
      continue
    }
    if (c === '"') {
      inStr = true
      out += c
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    out += c
  }
  // 去掉可能的尾逗号
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// ---------------------------------------------------------------- 分类 / 周期

/**
 * wikiID 结构解析。实测存在这些形态：
 *   A1        类别字母 + 序号
 *   Bd1       类别 + 周期字母 + 序号
 *   2604B3    年月前缀 + 类别 + 序号
 *   L2606C2   L(期间限定) + 年月 + 类别 + 序号
 *   WA01/SN06 活动/特殊任务
 *   ''        10 个任务无 wikiID
 */
const CATEGORY = {
  A: '编成',
  B: '出击',
  C: '演习',
  D: '远征',
  E: '补给/入渠',
  F: '工厂',
  G: '改装',
}
const PERIOD = {
  d: '日常',
  w: '周常',
  m: '月常',
  q: '季常',
  y: '年常',
  s: '特殊',
  u: '特殊',
}

function parseWikiId(wikiId) {
  const w = (wikiId ?? '').trim()
  if (!w) return { category: '其他', period: '单次', special: true }

  // L2606C2 -> 期间限定：L + 年月(4) + 类别 + 序号
  let m = /^L(\d{4})([A-Z])([a-z]?)(\d*)$/.exec(w)
  if (m) {
    return {
      category: CATEGORY[m[2]] ?? '其他',
      period: m[3] ? PERIOD[m[3]] ?? '单次' : '月常', // 期间限定多为月常，后续用社区表校准
      limited: true,
    }
  }
  // 2604B3 -> 年月前缀 + 类别 + 序号
  m = /^(\d{4})([A-Z])([a-z]?)(\d*)$/.exec(w)
  if (m) {
    return {
      category: CATEGORY[m[2]] ?? '其他',
      period: m[3] ? PERIOD[m[3]] ?? '单次' : '单次',
      limited: true,
    }
  }
  // A1 / Bd1 -> 类别 + 可选周期 + 序号
  m = /^([A-Z])([a-z]?)(\d+)$/.exec(w)
  if (m) {
    return {
      category: CATEGORY[m[1]] ?? '其他',
      period: m[2] ? PERIOD[m[2]] ?? '单次' : '单次',
    }
  }
  // WA01 / SN06 等活动任务
  return { category: '其他', period: '单次', special: true }
}

/** 用社区维护的 questCategory.json 校准周期（权威优先） */
function calibratePeriod(quests, categoryTable) {
  const map = {
    dailyQuest: '日常',
    weeklyQuest: '周常',
    monthlyQuest: '月常',
    quarterlyQuest: '季常',
    yearlyQuest: '年常',
  }
  let fixed = 0
  for (const [key, label] of Object.entries(map)) {
    for (const id of categoryTable[key] ?? []) {
      const q = quests.get(Number(id))
      if (q && q.period !== label) {
        q.period = label
        fixed++
      }
    }
  }
  return fixed
}

// ---------------------------------------------------------------- 名称烘焙

/**
 * 从 start2.json 烘焙舰名/装备名。
 * 修复「奖励显示为 装备#123」——运行时 store.const 只在游戏加载后才有值，
 * 因此必须在构建期把名称写进数据。
 */
function bakeNames(start2Path) {
  const d = readJson(start2Path)
  const ships = {}
  for (const s of d.api_mst_ship ?? []) {
    if (s.api_name) ships[s.api_id] = s.api_name
  }
  const items = {}
  for (const s of d.api_mst_slotitem ?? []) {
    if (s.api_name) items[s.api_id] = s.api_name
  }
  const useitems = {}
  for (const s of d.api_mst_useitem ?? []) {
    if (s.api_name) useitems[s.api_id] = s.api_name
  }
  return { ships, items, useitems }
}


/** 空串 -> null，否则按 JSON 解析 */
function parseJsonCell(cell, ctx) {
  const s = (cell ?? '').trim()
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch (e) {
    throw new Error(`JSON 解析失败 @ ${ctx}: ${e.message}\n  原文: ${s.slice(0, 120)}`)
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

// ---------------------------------------------------------------- 载入 kanxy

function loadKanxyQuests() {
  const rows = parseCsv(readFileSync(join(RAW, 'quest.csv'), 'utf8'))
  const header = rows[0]
  // 表头是中文，按位置取更稳妥，但仍校验列数
  const [C_ID, C_WIKI, C_NAME, C_DATE, C_PRE, C_DESC, C_RES, C_FIX, C_SEL] = [
    0, 1, 2, 3, 4, 5, 6, 7, 8,
  ]
  if (header.length < 9) {
    throw new Error(`quest.csv 表头列数异常: ${header.length} (期望 >=9)`)
  }

  const quests = new Map()
  for (const r of rows.slice(1)) {
    if (!r[C_ID] || !/^\d+$/.test(r[C_ID].trim())) continue
    const id = Number(r[C_ID].trim())
    const ctx = `quest ${id}`
    quests.set(id, {
      id,
      wikiId: (r[C_WIKI] ?? '').trim(),
      name: (r[C_NAME] ?? '').trim(), // 日文原名，后续可被中文名覆盖
      nameJa: (r[C_NAME] ?? '').trim(),
      date: (r[C_DATE] ?? '').trim(),
      // 原始 wikiID 前置，解析后得到 prereqIds
      prereqWiki: (r[C_PRE] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      desc: (r[C_DESC] ?? '').trim(),
      descJa: (r[C_DESC] ?? '').trim(),
      resource: parseJsonCell(r[C_RES], `${ctx} 资源奖励`), // [油,弹,钢,铝]
      fixedReward: parseJsonCell(r[C_FIX], `${ctx} 固定奖励`),
      choiceReward: parseJsonCell(r[C_SEL], `${ctx} 选择奖励`), // 二维
      source: 'kanxy',
    })
  }
  return quests
}

/**
 * wikiID -> id 映射。
 * wikiID 不唯一（2604B3 重复）且有空值，重复时取「更新日期」较新者。
 */
function buildWikiIndex(quests) {
  const idx = new Map()
  const dupes = []
  for (const q of quests.values()) {
    if (!q.wikiId) continue
    const prev = idx.get(q.wikiId)
    if (prev === undefined) {
      idx.set(q.wikiId, q.id)
      continue
    }
    const prevQ = quests.get(prev)
    const newer = dateKey(q.date) >= dateKey(prevQ.date) ? q : prevQ
    idx.set(q.wikiId, newer.id)
    dupes.push({ wikiId: q.wikiId, ids: [prevQ.id, q.id], picked: newer.id })
  }
  return { idx, dupes }
}

/** "2026/4/23" -> 20260423，便于比较；无效日期返回 0 */
function dateKey(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec((s ?? '').trim())
  if (!m) return 0
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
}

/**
 * 剥离任务名里的周期/类型前缀噪音。
 * 公开源的名字常带 "(月任)"、"【工厂任务】" 等前缀，
 * 而 UI 已有独立的类别/周期徽章，前缀属重复信息。
 */
const NAME_PREFIX = /^[(（【[]\s*(日任|周任|月任|季任|年任|单次|期间限定任务|期間限定任務|期间限定扩张任务|工厂任务|工廠任務|改装任务|出击任务|演习任务|远征任务|编成任务|补给任务)\s*[)）】\]]\s*/

function cleanName(name) {
  let s = (name ?? '').trim()
    // 可能有多重前缀，循环剥离
  for (let i = 0; i < 3; i++) {
    const next = s.replace(NAME_PREFIX, '')
    if (next === s) break
    s = next
  }
  return s || name
}


// ---------------------------------------------------------------- 图构建

function buildGraph(quests, wikiIdx) {
  let dangling = 0
  const danglingSamples = []

  for (const q of quests.values()) {
    q.prereqIds = []
    for (const w of q.prereqWiki ?? []) {
      const target = wikiIdx.get(w)
      if (target === undefined) {
        dangling++
        if (danglingSamples.length < 10) danglingSamples.push({ id: q.id, ref: w })
        continue
      }
      if (target !== q.id) q.prereqIds.push(target)
    }
    q.unlocks = []
  }
  // 反向边
  for (const q of quests.values()) {
    for (const pid of q.prereqIds) {
      const p = quests.get(pid)
      if (p) p.unlocks.push(q.id)
    }
  }
  return { dangling, danglingSamples }
}

/** 检测环并计算最长链深度（拓扑 + 记忆化） */
function analyzeDepth(quests) {
  const memo = new Map()
  const state = new Map() // 0/undefined=未访问 1=访问中 2=完成
  const cycles = []

  const depth = (id) => {
    if (memo.has(id)) return memo.get(id)
    if (state.get(id) === 1) {
      cycles.push(id)
      return 0
    }
    state.set(id, 1)
    let d = 0
    for (const pid of quests.get(id)?.prereqIds ?? []) {
      d = Math.max(d, depth(pid) + 1)
    }
    state.set(id, 2)
    memo.set(id, d)
    return d
  }

  for (const id of quests.keys()) depth(id)
  for (const [id, d] of memo) {
    const q = quests.get(id)
    if (q) q.depth = d
  }
  return { cycles, memo }
}

// ---------------------------------------------------------------- 多源合并

/**
 * 合并公开源的中文名/描述，并并入 kanxy 缺失的任务。
 * kcanotify: { "<api_no>": {code, name, desc, rewards, resources} }
 * kcQuests:  { "<api_no>": {code, name, desc, rewards, pre: ["A1"]} }
 */
function mergeRemote(quests, wikiIdx, remote) {
  const stat = { translated: 0, addedFromRemote: 0, sources: [] }

  for (const [srcName, data] of Object.entries(remote)) {
    if (!data) continue
    stat.sources.push(srcName)
    for (const [key, val] of Object.entries(data)) {
      if (!/^\d+$/.test(key)) continue
      const id = Number(key)
      const existing = quests.get(id)
      if (existing) {
        // 只在还是日文原名时覆盖，优先第一个提供中文的源
        if (val.name && existing.name === existing.nameJa) {
          existing.name = String(val.name).trim()
          existing.translatedBy = srcName
          stat.translated++
        }
        if (val.desc && existing.desc === existing.descJa) {
          existing.desc = String(val.desc).trim()
        }
        if (!existing.wikiId && val.code) existing.wikiId = String(val.code).trim()
        if (val.rewards && !existing.rewardText) existing.rewardText = String(val.rewards).trim()
      } else {
        // kanxy 没有的任务（实测 kcanotify 有 6 个），并入以保证覆盖
        quests.set(id, {
          id,
          wikiId: val.code ? String(val.code).trim() : '',
          name: val.name ? String(val.name).trim() : `Quest ${id}`,
          nameJa: '',
          date: '',
          prereqWiki: Array.isArray(val.pre) ? val.pre.map(String) : [],
          desc: val.desc ? String(val.desc).trim() : '',
          descJa: '',
          resource: Array.isArray(val.resources) ? val.resources[0] ?? null : null,
          fixedReward: null,
          choiceReward: null,
          rewardText: val.rewards ? String(val.rewards).trim() : undefined,
          source: srcName,
        })
        stat.addedFromRemote++
      }
    }
  }
  return stat
}

// ---------------------------------------------------------------- 编成要求

function loadRequirements() {
  const raw = readJson(join(RAW, 'QuestRequirements.json'))
  const byId = new Map()
  for (const e of raw) {
    if (e && e.ID != null) byId.set(Number(e.ID), e['要求'] ?? [])
  }
  return byId
}

// ---------------------------------------------------------------- 主流程

async function main() {
  console.log('[1/6] 读取 kanxy quest.csv ...')
  const quests = loadKanxyQuests()
  console.log(`      kanxy 任务数: ${quests.size}`)

  const { idx: wikiIdx, dupes } = buildWikiIndex(quests)
  console.log(`      wikiID 索引: ${wikiIdx.size} 条${dupes.length ? `，重复 ${dupes.length} 处已按日期取新` : ''}`)
  for (const d of dupes) {
    console.log(`        重复 wikiID ${d.wikiId}: [${d.ids.join(', ')}] -> 采用 ${d.picked}`)
  }

  console.log('[2/6] 合并公开数据源（中文名 / 缺失任务）...')
  const remote = {}
  if (OFFLINE) {
    console.log('      --offline，跳过联网')
  } else {
    for (const [name, url] of Object.entries(REMOTE)) {
      try {
        remote[name] = await fetchJson(url)
        console.log(`      ${name}: ${Object.keys(remote[name]).length} 条`)
      } catch (e) {
        console.warn(`      ⚠ ${name} 拉取失败（降级继续）: ${e.message}`)
      }
    }
  }
  const mergeStat = mergeRemote(quests, wikiIdx, remote)
  if (mergeStat.addedFromRemote) {
    console.log(`      从公开源并入 kanxy 缺失任务: ${mergeStat.addedFromRemote}`)
  }
  if (mergeStat.translated) {
    console.log(`      套用中文名: ${mergeStat.translated}`)
  }

  // 并入新任务后需重建 wikiID 索引，否则新任务的 wikiID 无法被前置引用解析
  const { idx: wikiIdx2 } = buildWikiIndex(quests)

  console.log('[3/6] 构建任务图（前置/后继）...')
  const { dangling, danglingSamples } = buildGraph(quests, wikiIdx2)
  const edges = [...quests.values()].reduce((n, q) => n + q.prereqIds.length, 0)
  console.log(`      节点 ${quests.size}，边 ${edges}，悬空前置 ${dangling}`)
  for (const s of danglingSamples) console.log(`        悬空: quest ${s.id} -> "${s.ref}"`)

  console.log('[4/6] 环检测 + 链深度 ...')
  const { cycles, memo } = analyzeDepth(quests)
  const maxDepth = Math.max(...memo.values())
  const deepest = [...quests.values()].find((q) => q.depth === maxDepth)
  console.log(`      环: ${cycles.length}，最长链: ${maxDepth} 级（${deepest?.wikiId} ${deepest?.name}）`)

  console.log('[5/7] 合并编成要求 DSL ...')
  const reqs = loadRequirements()
  let reqHit = 0
  for (const q of quests.values()) {
    const r = reqs.get(q.id)
    if (r) {
      q.fleetReq = r
      reqHit++
    }
  }
  console.log(`      命中 ${reqHit} 条`)

  console.log('[6/7] 解析分类/周期 + 烘焙名称 ...')
  for (const q of quests.values()) {
    const parsed = parseWikiId(q.wikiId)
    q.category = parsed.category
    q.period = parsed.period
    if (parsed.limited) q.limited = true
  }  // 社区分类表校准（权威优先）
  let calibrated = 0
  try {
    const table = readJson(join(ROOT, 'data', 'raw', 'community', 'questCategory.json'))
    calibrated = calibratePeriod(quests, table)
  } catch (e) {
    console.warn(`      ⚠ 社区分类表不可用，仅用 wikiID 推导: ${e.message}`)
  }
  const catStat = {}
  const perStat = {}
  for (const q of quests.values()) {
    catStat[q.category] = (catStat[q.category] ?? 0) + 1
    perStat[q.period] = (perStat[q.period] ?? 0) + 1
  }
  console.log(`      类别: ${JSON.stringify(catStat)}`)
  console.log(`      周期: ${JSON.stringify(perStat)}（社区表校准 ${calibrated} 条）`)

  // 剥离名称前缀噪音（UI 已有类别/周期徽章）
  let cleaned = 0
  for (const q of quests.values()) {
    const c = cleanName(q.name)
    if (c !== q.name) {
      q.name = c
      cleaned++
    }
  }
  console.log(`      剥离名称前缀: ${cleaned} 条`)

  let names = { ships: {}, items: {}, useitems: {} }
  try {
    names = bakeNames(join(RAW, 'start2.json'))
    console.log(`      名称烘焙: 舰 ${Object.keys(names.ships).length} / 装备 ${Object.keys(names.items).length}`)
  } catch (e) {
    console.warn(`      ⚠ start2.json 不可用，奖励将显示为编号: ${e.message}`)
  }

  // ---- 自检（回归基线）
  console.log('[7/7] 自检 ...')
  const problems = []
  if (quests.size < BASELINE.minQuests) {
    problems.push(`任务数 ${quests.size} < 基线 ${BASELINE.minQuests}`)
  }
  if (dangling > BASELINE.danglingPrereq) {
    problems.push(`悬空前置 ${dangling} > 基线 ${BASELINE.danglingPrereq}`)
  }
  if (cycles.length > BASELINE.cycles) {
    problems.push(`检测到环 ${cycles.length} > 基线 ${BASELINE.cycles}`)
  }
  // 奖励完整性：道具名可解析
  const rewardNames = readJson(join(RAW, 'QuestRewardName.json'))
  const useitemNames = rewardNames['13'] ?? {}
  const missingNames = new Set()
  for (const q of quests.values()) {
    const groups = [
      ...(q.fixedReward ? [q.fixedReward] : []),
      ...((q.choiceReward ?? []).flat ? (q.choiceReward ?? []) : []),
    ]
    for (const g of groups) {
      for (const o of Array.isArray(g) ? g : [g]) {
        if (o && o.api_kind === 13 && !(String(o.api_mst_id) in useitemNames)) {
          missingNames.add(o.api_mst_id)
        }
      }
    }
  }
  if (missingNames.size) {
    console.warn(`      ⚠ 缺失道具名 ${missingNames.size} 个: ${[...missingNames].slice(0, 10).join(', ')}`)
  }

  // 自检：奖励名称可解析率（问题3 的回归防线）
  let rewardTotal = 0
  let rewardNamed = 0
  for (const q of quests.values()) {
    const groups = [...(q.fixedReward ? [q.fixedReward] : []), ...(q.choiceReward ?? [])]
    for (const g of groups) {
      for (const o of Array.isArray(g) ? g : [g]) {
        if (!o || o.api_kind == null) continue
        rewardTotal++
        const id = String(o.api_mst_id)
        const named =
          (o.api_kind === 11 && names.ships[id]) ||
          (o.api_kind === 12 && names.items[id]) ||
          (o.api_kind === 13 && useitemNames[id]) ||
          o.api_kind === 14 ||
          o.api_kind === 18
        if (named) rewardNamed++
      }
    }
  }
  const namedRate = rewardTotal ? (rewardNamed / rewardTotal) * 100 : 0
  console.log(`      奖励名称可解析: ${rewardNamed}/${rewardTotal} (${namedRate.toFixed(1)}%)`)
  if (namedRate < 99) {
    problems.push(`奖励名称可解析率 ${namedRate.toFixed(1)}% < 99%`)
  }

  if (problems.length) {
    console.error('\n❌ 自检未通过：')
    for (const p of problems) console.error(`   - ${p}`)
    process.exit(1)
  }
  console.log(`      ✅ 任务数 ${quests.size} / 悬空 ${dangling} / 环 ${cycles.length} —— 符合基线`)

  if (VERIFY_ONLY) {
    console.log('\n--verify-only：不写文件。')
    return
  }

  // ---- 输出
  mkdirSync(OUT, { recursive: true })

  const questsOut = {}
  for (const q of [...quests.values()].sort((a, b) => a.id - b.id)) {
    questsOut[q.id] = {
      id: q.id,
      wikiId: q.wikiId,
      name: q.name,
      nameJa: q.nameJa || undefined,
      desc: q.desc,
      date: q.date || undefined,
      category: q.category,
      period: q.period,
      limited: q.limited || undefined,
      prereqIds: q.prereqIds,
      unlocks: q.unlocks,
      depth: q.depth ?? 0,
      resource: q.resource,
      fixedReward: q.fixedReward,
      choiceReward: q.choiceReward,
      rewardText: q.rewardText,
      fleetReq: q.fleetReq,
      source: q.source,
    }
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    questCount: quests.size,
    edges,
    maxDepth,
    categories: Object.keys(catStat),
    periods: Object.keys(perStat),
    sources: ['kanxy', ...mergeStat.sources],
    baseline: BASELINE,
  }

  writeFileSync(
    join(OUT, 'quests.json'),
    JSON.stringify({ meta, quests: questsOut }, null, 0),
    'utf8',
  )

  // 编成要求查表 + 烘焙的名称表（修复奖励显示编号问题）
  const ctype = readJson(join(RAW, 'ctype.json'))
  const country = parseJson5Lite(readFileSync(join(RAW, 'SHIP_COUNTRY.json'), 'utf8'))
  writeFileSync(
    join(OUT, 'requirements.json'),
    JSON.stringify({ ctype, country, rewardNames, names }, null, 0),
    'utf8',
  )

  console.log(`\n✅ 输出:`)
  console.log(`   assets/quests.json        (${quests.size} 任务)`)
  console.log(
    `   assets/requirements.json  (ctype ${Object.keys(ctype).length} / country ${Object.keys(country).length} / 舰名 ${Object.keys(names.ships).length} / 装备名 ${Object.keys(names.items).length})`,
  )
}

main().catch((e) => {
  console.error('\n❌ 构建失败:', e.stack ?? e.message)
  process.exit(1)
})
