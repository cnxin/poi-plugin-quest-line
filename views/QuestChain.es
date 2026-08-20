/**
 * 任务链图形化视图：SVG 绘制的分层 DAG。
 *
 * 布局由 lib/chain-layout.es 计算（纯函数，已单测）。
 * 焦点任务居中，前置在上、后继在下，点击任意节点可切换焦点。
 *
 * 分支过多的处理（实测 B6 有 28 个直接后继，不限制时单层可达 87 节点、宽 10976px）：
 *   1. 每层最多显示 MAX_PER_LAYER 个，其余折叠为「+N」块，点击展开该层
 *   2. 画布可缩放，默认自动适应面板宽度
 *   3. 仍超出时可横向滚动
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import styled from 'styled-components'
import { Button, ButtonGroup, Callout } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { computeChainLayout } from '../lib/chain-layout.es'
import { STATUS } from '../redux/selectors.es'

const Wrap = styled.div`
  font-size: 12px;
  ${(p) => (p.$fill ? 'display:flex; flex-direction:column; height:100%; min-height:0;' : '')}
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
`

const Hint = styled.span`
  font-size: 11px;
  opacity: 0.55;
  flex: 1;
  min-width: 120px;
`

const Canvas = styled.div`
  overflow: auto;
  ${(p) => (p.$fill ? 'flex: 1; min-height: 0;' : 'max-height: 430px;')}
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.16);
  cursor: ${(p) => (p.$panning ? 'grabbing' : 'grab')};
  user-select: ${(p) => (p.$panning ? 'none' : 'auto')};
`

const NodeG = styled.g`
  cursor: ${(p) => (p.$focus ? 'default' : 'pointer')};
  &:hover rect {
    stroke-width: 2;
    filter: brightness(1.25);
  }
`

const MoreG = styled.g`
  cursor: pointer;
  &:hover rect {
    filter: brightness(1.4);
  }
`

const CAT_COLOR = {
  编成: '#48aff0',
  出击: '#ff7373',
  演习: '#3dcc91',
  远征: '#ffb366',
  '补给/入渠': '#a3a3a3',
  工厂: '#c99bf5',
  改装: '#ffd966',
  其他: '#8a8a8a',
}

const STATUS_STROKE = {
  [STATUS.COMPLETED]: '#3dcc91',
  [STATUS.IN_PROGRESS]: '#48aff0',
  [STATUS.AVAILABLE]: '#ffb366',
  [STATUS.LOCKED]: 'rgba(255,255,255,0.18)',
}

/** 按节点宽度估算可容纳的字符数（中文约 10px/字，留出左右内边距） */
function fitToWidth(text, nodeWidth) {
  const max = Math.floor((nodeWidth - 14) / 10)
  const s = text ?? ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** 三次贝塞尔曲线，竖直方向出入 */
function edgePath(e) {
  const dy = Math.max(14, (e.y2 - e.y1) / 2)
  return `M${e.x1},${e.y1} C${e.x1},${e.y1 + dy} ${e.x2},${e.y2 - dy} ${e.x2},${e.y2}`
}

const DEFAULT_DEPTH = 2
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5]

export const QuestChain = ({
  questId,
  status = {},
  onSelect,
  /** 铺满父容器高度（独立任务线页面用） */
  fill = false,
  /** 每层最多显示的节点数；独立页面空间大可以放宽 */
  maxPerLayer,
  initialDepth = DEFAULT_DEPTH,
}) => {
  const db = useMemo(() => getDb(), [])
  const [upDepth, setUpDepth] = useState(initialDepth)
  const [downDepth, setDownDepth] = useState(initialDepth)
  const [expanded, setExpanded] = useState(() => new Set())
  const [hover, setHover] = useState(null)
  const [zoom, setZoom] = useState(null) // null = 自动适应宽度
  const [panning, setPanning] = useState(false)
  const boxRef = useRef(null)
  const panRef = useRef(null)
  const [boxW, setBoxW] = useState(0)

  // 切换任务时重置视图状态
  useEffect(() => {
    setUpDepth(initialDepth)
    setDownDepth(initialDepth)
    setExpanded(new Set())
    setZoom(null)
  }, [questId, initialDepth])

  // 观测容器宽度以计算自动缩放
  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const update = () => setBoxW(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 拖动平移：直接改容器滚动位置，比 transform 方案更稳
  const onMouseDown = useCallback((e) => {
    // 点在节点上时不启动拖动，避免和点击选择冲突
    if (e.target.closest && e.target.closest('g[data-node]')) return
    const el = boxRef.current
    if (!el) return
    panRef.current = {
      x: e.pageX,
      y: e.pageY,
      left: el.scrollLeft,
      top: el.scrollTop,
    }
    setPanning(true)
  }, [])

  useEffect(() => {
    if (!panning) return undefined
    const onMove = (e) => {
      const el = boxRef.current
      const p = panRef.current
      if (!el || !p) return
      el.scrollLeft = p.left - (e.pageX - p.x)
      el.scrollTop = p.top - (e.pageY - p.y)
    }
    const onUp = () => setPanning(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [panning])

  const layout = useMemo(
    () => computeChainLayout(questId, { upDepth, downDepth, expanded, maxPerLayer }),
    [questId, upDepth, downDepth, expanded, maxPerLayer],
  )

  const toggleLayer = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  if (!layout) return null
  const { nodes, edges, moreChips, width, height, moreUp, moreDown, upCount, downCount, hiddenCount } =
    layout

  if (nodes.length === 1 && !moreChips.length) {
    return <Callout icon="info-sign">该任务是独立任务，无前置也无后续。</Callout>
  }

  // 自动缩放：宽度超出容器时按比例缩小，但不小于 0.4 以免看不清
  const autoScale = boxW > 0 && width > boxW ? Math.max(0.4, boxW / width) : 1
  const scale = zoom ?? autoScale

  const isLit = (e) => hover != null && (e.from === hover || e.to === hover)

  return (
    <Wrap $fill={fill}>
      <Toolbar>
        <Button
          small
          minimal
          icon="chevron-up"
          disabled={!moreUp}
          onClick={() => setUpDepth((d) => d + 2)}
        >
          展开前置
        </Button>
        <Button
          small
          minimal
          icon="chevron-down"
          disabled={!moreDown}
          onClick={() => setDownDepth((d) => d + 2)}
        >
          展开后续
        </Button>
        <ButtonGroup minimal>
          <Button small active={zoom === null} onClick={() => setZoom(null)} title="自动适应宽度">
            适应
          </Button>
          {ZOOM_STEPS.map((z) => (
            <Button key={z} small active={zoom === z} onClick={() => setZoom(z)}>
              {`${z * 100}%`}
            </Button>
          ))}
        </ButtonGroup>
        <Hint>
          前置 {upCount} ｜ 后续 {downCount}
          {hiddenCount > 0 && ` ｜ 已折叠 ${hiddenCount} 个（点 +N 展开）`}
          {' ｜ 可拖动画布'}
        </Hint>
      </Toolbar>

      <Canvas ref={boxRef} $fill={fill} $panning={panning} onMouseDown={onMouseDown}>
        <svg
          width={width * scale}
          height={height * scale}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block' }}
        >
          <g>
            {edges.map((e) => (
              <path
                key={`${e.from}-${e.to}`}
                d={edgePath(e)}
                fill="none"
                stroke={isLit(e) ? '#48aff0' : 'rgba(255,255,255,0.22)'}
                strokeWidth={isLit(e) ? 1.8 : 1}
                strokeDasharray={e.skip ? '3,3' : undefined}
              />
            ))}
          </g>

          <g>
            {nodes.map((n) => {
              const q = db.quests[n.id]
              const cat = CAT_COLOR[q.category] ?? '#8a8a8a'
              const st = STATUS_STROKE[status[n.id]] ?? 'rgba(255,255,255,0.18)'
              const done = status[n.id] === STATUS.COMPLETED
              return (
                <NodeG
                  key={n.id}
                  data-node="1"
                  $focus={n.isFocus}
                  onClick={() => !n.isFocus && onSelect?.(n.id)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`[${q.wikiId || q.id}] ${q.name}\n${q.category} / ${q.period}`}</title>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.w}
                    height={n.h}
                    rx={3}
                    fill={n.isFocus ? 'rgba(72,175,240,0.28)' : 'rgba(255,255,255,0.05)'}
                    stroke={n.isFocus ? '#48aff0' : st}
                    strokeWidth={n.isFocus ? 2 : 1}
                    opacity={done ? 0.65 : 1}
                  />
                  <rect x={n.x} y={n.y} width={3} height={n.h} rx={1.5} fill={cat} />
                  <text x={n.x + 8} y={n.y + 11} fontSize={9} fill={cat} fontFamily="monospace">
                    {fitToWidth(q.wikiId || String(q.id), n.w)}
                  </text>
                  <text x={n.x + 8} y={n.y + 21} fontSize={10} fill="currentColor" opacity={0.85}>
                    {fitToWidth(q.name, n.w)}
                  </text>
                </NodeG>
              )
            })}
          </g>

          {/* 每层折叠的「+N」块 */}
          <g>
            {moreChips.map((c) => (
              <MoreG key={c.key} data-node="1" onClick={() => toggleLayer(c.key)}>
                <title>{`还有 ${c.count} 个任务，点击展开本层`}</title>
                <rect
                  x={c.x}
                  y={c.y}
                  width={c.w}
                  height={c.h}
                  rx={3}
                  fill="rgba(72,175,240,0.14)"
                  stroke="rgba(72,175,240,0.5)"
                  strokeDasharray="3,2"
                />
                <text
                  x={c.x + c.w / 2}
                  y={c.y + 17}
                  fontSize={11}
                  fill="#48aff0"
                  textAnchor="middle"
                >
                  +{c.count}
                </text>
              </MoreG>
            ))}
          </g>
        </svg>
      </Canvas>
    </Wrap>
  )
}

export default QuestChain
