/**
 * 任务链 DAG 布局计算（纯函数，与渲染解耦便于测试）。
 *
 * 采用简化的 Sugiyama 分层布局：
 *   1. 以焦点任务为中心，向上 BFS 得前置层、向下 BFS 得后继层
 *   2. 用重心法（barycenter）对每层节点排序以减少连线交叉
 *   3. 每层水平居中分布，层间固定行距
 *
 * 注意：任务链最深 26 级、317 个任务有多个前置，所以必须支持逐层展开，
 * 不能一次全画。
 */
import { getDb } from './quest-db.es'

export const NODE_W = 116
export const NODE_H = 26
/** 焦点节点加宽，避免最重要的那个名字被截断 */
export const FOCUS_W = 168
export const GAP_X = 10
export const GAP_Y = 46
export const PAD = 12

/** 按方向 BFS 分层 */
function bfsLayers(startId, dir, maxLayers, quests, exclude) {
  const layers = []
  let frontier = [startId]
  const seen = new Set([startId, ...(exclude ?? [])])
  for (let i = 0; i < maxLayers; i++) {
    const next = []
    for (const id of frontier) {
      for (const n of quests[id]?.[dir] ?? []) {
        if (seen.has(n)) continue
        seen.add(n)
        next.push(n)
      }
    }
    if (!next.length) break
    layers.push(next)
    frontier = next
  }
  return layers
}

/** 该方向是否还有未展开的层 */
function hasMore(layers, startId, dir, quests) {
  const seen = new Set([startId])
  layers.flat().forEach((i) => seen.add(i))
  const last = layers[layers.length - 1] ?? [startId]
  return last.some((id) => (quests[id]?.[dir] ?? []).some((n) => !seen.has(n)))
}

/**
 * 重心法减少交叉：按相邻层中已定位邻居的平均位置排序。
 * ref 为参考层的 id->index 映射。
 */
function orderByBarycenter(layer, refIndex, quests, dir) {
  if (!refIndex) return layer
  const bary = (id) => {
    const neighbors = quests[id]?.[dir] ?? []
    const positions = neighbors.map((n) => refIndex.get(n)).filter((v) => v != null)
    if (!positions.length) return Number.MAX_SAFE_INTEGER
    return positions.reduce((a, b) => a + b, 0) / positions.length
  }
  return [...layer].sort((a, b) => bary(a) - bary(b))
}

/**
 * 计算布局。
 * @returns {nodes, edges, width, height, moreUp, moreDown, upCount, downCount}
 */
export function computeChainLayout(focusId, opts = {}) {
  const { upDepth = 2, downDepth = 2 } = opts
  const db = getDb()
  const quests = db.quests
  if (!quests[focusId]) return null

  const upLayers = bfsLayers(focusId, 'prereqIds', upDepth, quests)
  // 后继方向要排除已出现在前置侧的节点，避免同一节点画两次
  const upIds = upLayers.flat()
  const downLayers = bfsLayers(focusId, 'unlocks', downDepth, quests, upIds)

  // 自上而下的层序：最远前置 → … → 焦点 → … → 最远后继
  const ordered = [...[...upLayers].reverse(), [focusId], ...downLayers]

  // 重心排序：先从焦点层向两端各扫一遍
  const focusLayerIdx = upLayers.length
  const indexOf = (layer) => new Map(layer.map((id, i) => [id, i]))

  // 向上（焦点 → 更早的前置）：参考下一层，按 unlocks 方向找邻居
  for (let i = focusLayerIdx - 1; i >= 0; i--) {
    ordered[i] = orderByBarycenter(ordered[i], indexOf(ordered[i + 1]), quests, 'unlocks')
  }
  // 向下（焦点 → 更远的后继）：参考上一层，按 prereqIds 方向找邻居
  for (let i = focusLayerIdx + 1; i < ordered.length; i++) {
    ordered[i] = orderByBarycenter(ordered[i], indexOf(ordered[i - 1]), quests, 'prereqIds')
  }

  const widthOf = (id) => (id === focusId ? FOCUS_W : NODE_W)
  const layerWidth = (layer) =>
    layer.reduce((w, id) => w + widthOf(id), 0) + (layer.length - 1) * GAP_X
  const maxWidth = Math.max(...ordered.map(layerWidth))
  const width = maxWidth + PAD * 2
  const height = ordered.length * NODE_H + (ordered.length - 1) * (GAP_Y - NODE_H) + PAD * 2

  const nodes = []
  const pos = new Map()
  ordered.forEach((layer, li) => {
    const lw = layerWidth(layer)
    let x = PAD + (maxWidth - lw) / 2
    const y = PAD + li * GAP_Y
    layer.forEach((id) => {
      const w = widthOf(id)
      const node = { id, x, y, w, h: NODE_H, layer: li, isFocus: id === focusId }
      nodes.push(node)
      pos.set(id, node)
      x += w + GAP_X
    })
  })

  // 边：渲染集合内所有「前置 -> 后继」关系（含跨层）
  const edges = []
  for (const node of nodes) {
    for (const pid of quests[node.id]?.prereqIds ?? []) {
      const from = pos.get(pid)
      if (!from) continue
      edges.push({
        from: pid,
        to: node.id,
        x1: from.x + from.w / 2,
        y1: from.y + from.h,
        x2: node.x + node.w / 2,
        y2: node.y,
        // 跨层连线单独标记，渲染时用虚线区分
        skip: Math.abs(node.layer - from.layer) > 1,
      })
    }
  }

  return {
    nodes,
    edges,
    width,
    height,
    moreUp: hasMore(upLayers, focusId, 'prereqIds', quests),
    moreDown: hasMore(downLayers, focusId, 'unlocks', quests),
    upCount: upIds.length,
    downCount: downLayers.flat().length,
  }
}
