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

export const NODE_W = 146
export const NODE_H = 34
/** 焦点节点加宽，避免最重要的那个名字被截断 */
export const FOCUS_W = 210
export const GAP_X = 10
export const GAP_Y = 58
export const PAD = 12

/** 每层默认最多显示的节点数。超出部分折叠为「+N」，点击可展开该层。
 *  实测扇出很不均衡：B6 有 28 个直接后继，Cd1 有 22 个，
 *  不加限制时单层可达 87 个节点、画布宽 10976px，完全没法看。 */
export const MAX_PER_LAYER = 8

/**
 * 按方向 BFS 分层，**边走边截断**。
 * 必须在 BFS 过程中截断而非事后裁剪，否则被隐藏节点的子节点仍会进入下一层，
 * 导致爆炸向下级联。
 */
function bfsLayers(startId, dir, maxLayers, quests, exclude, maxPerLayer, expanded, side) {
  const layers = []
  const hidden = []
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
    const key = `${side}:${i}`
    const isExpanded = expanded?.has(key)
    let shown = next
    let cut = 0
    if (!isExpanded && maxPerLayer > 0 && next.length > maxPerLayer) {
      shown = next.slice(0, maxPerLayer)
      cut = next.length - maxPerLayer
      // 被截断的节点不再参与后续层扩展，避免级联
      for (const n of next.slice(maxPerLayer)) seen.delete(n)
    }
    layers.push(shown)
    hidden.push({ key, count: cut, total: next.length })
    frontier = shown
  }
  return { layers, hidden }
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
 * 计算让焦点节点居于视野中央所需的滚动位置。
 * 焦点未必在画布中心（例如无前置时它在最上层、无后继时在最下层），
 * 不主动滚动的话会被挤到边缘看不见。
 *
 * @returns {left, top} 已按内容边界夹取，不会出现负值或超滚
 */
export function computeFocusScroll(focusNode, scale, clientW, clientH, contentW, contentH) {
  if (!focusNode) return { left: 0, top: 0 }
  const cx = (focusNode.x + focusNode.w / 2) * scale
  const cy = (focusNode.y + focusNode.h / 2) * scale
  const maxLeft = Math.max(0, contentW * scale - clientW)
  const maxTop = Math.max(0, contentH * scale - clientH)
  return {
    left: Math.min(maxLeft, Math.max(0, cx - clientW / 2)),
    top: Math.min(maxTop, Math.max(0, cy - clientH / 2)),
  }
}

/**
 * 计算布局。
 * @returns {nodes, edges, moreChips, width, height, moreUp, moreDown, upCount, downCount, hiddenCount}
 */
export function computeChainLayout(focusId, opts = {}) {
  const {
    upDepth = 2,
    downDepth = 2,
    maxPerLayer = MAX_PER_LAYER,
    expanded = new Set(),
  } = opts
  const db = getDb()
  const quests = db.quests
  if (!quests[focusId]) return null

  const up = bfsLayers(focusId, 'prereqIds', upDepth, quests, null, maxPerLayer, expanded, 'up')
  const upLayers = up.layers
  // 后继方向要排除已出现在前置侧的节点，避免同一节点画两次
  const upIds = upLayers.flat()
  const down = bfsLayers(focusId, 'unlocks', downDepth, quests, upIds, maxPerLayer, expanded, 'down')
  const downLayers = down.layers

  // 自上而下的层序：最远前置 → … → 焦点 → … → 最远后继
  const ordered = [...[...upLayers].reverse(), [focusId], ...downLayers]
  // 每个层序位置对应的折叠信息（焦点层无折叠）
  const hiddenByRow = [
    ...[...up.hidden].reverse(),
    { key: null, count: 0 },
    ...down.hidden,
  ]

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
  /** 折叠提示块的宽度 */
  const MORE_W = 62
  const rowWidth = (layer, li) => {
    const base = layer.reduce((w, id) => w + widthOf(id), 0) + (layer.length - 1) * GAP_X
    return base + (hiddenByRow[li]?.count > 0 ? MORE_W + GAP_X : 0)
  }
  const maxWidth = Math.max(...ordered.map(rowWidth))
  const width = maxWidth + PAD * 2
  const height = ordered.length * NODE_H + (ordered.length - 1) * (GAP_Y - NODE_H) + PAD * 2

  const nodes = []
  const moreChips = []
  const pos = new Map()
  ordered.forEach((layer, li) => {
    const lw = rowWidth(layer, li)
    let x = PAD + (maxWidth - lw) / 2
    const y = PAD + li * GAP_Y
    layer.forEach((id) => {
      const w = widthOf(id)
      const node = { id, x, y, w, h: NODE_H, layer: li, isFocus: id === focusId }
      nodes.push(node)
      pos.set(id, node)
      x += w + GAP_X
    })
    const h = hiddenByRow[li]
    if (h?.count > 0) {
      moreChips.push({ key: h.key, x, y, w: MORE_W, h: NODE_H, count: h.count, layer: li })
    }
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
    moreChips,
    width,
    height,
    moreUp: hasMore(upLayers, focusId, 'prereqIds', quests),
    moreDown: hasMore(downLayers, focusId, 'unlocks', quests),
    upCount: upIds.length,
    downCount: downLayers.flat().length,
    /** 因每层限额而隐藏的节点总数 */
    hiddenCount: hiddenByRow.reduce((n, h) => n + (h?.count ?? 0), 0),
  }
}
