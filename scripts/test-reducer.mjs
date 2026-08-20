/**
 * reducer 纯逻辑测试（不依赖 poi 运行时）。
 * 用法：node scripts/test-reducer.mjs
 */
import { transformAsync } from '@babel/core'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 把 .es 转成 CJS 后在内存里执行，模拟 poi 的加载方式
const src = readFileSync(join(ROOT, 'redux', 'reducer.es'), 'utf8')
const { code } = await transformAsync(src, {
  filename: 'reducer.es',
  babelrc: false,
  configFile: false,
  presets: [['@babel/preset-env', { targets: { node: '20' } }]],
})
const m = new Module('reducer')
m._compile(code, join(ROOT, 'redux', 'reducer.js'))
const { reducer } = m.exports

let fail = 0
const check = (name, cond, detail = '') => {
  console.log(cond ? `  ✅ ${name}` : `  ❌ ${name} ${detail}`)
  if (!cond) fail++
}

console.log('== reducer ==')

// 初始状态
let s = reducer(undefined, { type: '@@INIT' })
check('初始状态结构正确',
  s && typeof s.questList === 'object' && Array.isArray(s.clearedIds) && Array.isArray(s.seenIds))

// questlist 响应（真实结构：api_list 含未占用槽位 -1）
s = reducer(s, {
  type: '@@Response/kcsapi/api_get_member/questlist',
  body: {
    api_list: [
      { api_no: 201, api_state: 2, api_title: '敵艦隊を撃滅せよ！' },
      { api_no: 216, api_state: 3, api_title: '敵艦隊主力を撃滅せよ！' },
      -1, // 未占用槽位
      null,
    ],
    api_exec_count: 2,
  },
  postBody: { api_tab_id: 0 },
})
check('解析 api_list 并跳过 -1/null',
  Object.keys(s.questList).length === 2, `实际 ${Object.keys(s.questList).length}`)
check('记录 tabId', s.tabId === 0)
check('记录 updatedAt', s.updatedAt > 0)
check('见过的任务累积到 seenIds',
  s.seenIds.includes(201) && s.seenIds.includes(216), JSON.stringify(s.seenIds))

// 领取奖励 -> 从列表移除并计入 clearedIds
s = reducer(s, {
  type: '@@Response/kcsapi/api_req_quest/clearitemget',
  body: {},
  postBody: { api_quest_id: '216' },
})
check('领奖后从列表移除', !s.questList[216])
check('领奖记入 clearedIds', s.clearedIds.includes(216))
check('领奖不清除 seenIds（跨会话反推需要）', s.seenIds.includes(216))
check('领奖不影响其他任务', !!s.questList[201])

// 放弃任务
s = reducer(s, {
  type: '@@Response/kcsapi/api_req_quest/stop',
  body: {},
  postBody: { api_quest_id: '201' },
})
check('放弃后移除', !s.questList[201])
check('放弃不计入 clearedIds', !s.clearedIds.includes(201))

// seenIds 去重
const dup = reducer(s, {
  type: '@@Response/kcsapi/api_get_member/questlist',
  body: { api_list: [{ api_no: 201, api_state: 1 }] },
  postBody: {},
})
check('seenIds 不产生重复',
  dup.seenIds.filter((x) => x === 201).length === 1, JSON.stringify(dup.seenIds))
check('无新增时 seenIds 引用不变（避免无谓重渲染）', dup.seenIds === s.seenIds)

// 异常输入不应崩溃
const before = s
s = reducer(s, { type: '@@Response/kcsapi/api_get_member/questlist', body: {} })
check('api_list 缺失时返回原状态', s === before)
s = reducer(s, { type: '@@Response/kcsapi/api_req_quest/clearitemget', postBody: {} })
check('quest_id 缺失时不崩溃', s === before)
s = reducer(s, { type: '@@Response/kcsapi/api_port/port', body: {} })
check('无关 action 原样返回', s === before)

// 不可变性
const prev = reducer(undefined, { type: '@@INIT' })
const next = reducer(prev, {
  type: '@@Response/kcsapi/api_get_member/questlist',
  body: { api_list: [{ api_no: 101, api_state: 1 }] },
  postBody: {},
})
check('未修改原状态对象', Object.keys(prev.questList).length === 0)
check('返回新对象', next !== prev)

console.log(fail === 0 ? '\n✅ 全部通过' : `\n❌ ${fail} 项未通过`)
process.exit(fail === 0 ? 0 : 1)
