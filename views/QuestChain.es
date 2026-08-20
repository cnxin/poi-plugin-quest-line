/**
 * 任务链图形化视图：SVG 绘制的分层 DAG。
 *
 * 布局由 lib/chain-layout.es 计算（纯函数，已单测）。
 * 焦点任务居中，前置在上、后继在下，点击任意节点可切换焦点。
 */
import React, { useMemo, useState, useEffect } from 'react'
import styled from 'styled-components'
import { Button, Callout } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { computeChainLayout } from '../lib/chain-layout.es'
import { STATUS } from '../redux/selectors.es'

const Wrap = styled.div`
  font-size: 12px;
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
`

const Canvas = styled.div`
  overflow: auto;
  max-height: 420px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.16);
`

const NodeG = styled.g`
  cursor: ${(p) => (p.$focus ? 'default' : 'pointer')};
  &:hover rect {
    stroke-width: 2;
    filter: brightness(1.25);
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

/** 状态 -> 节点描边色 */
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

export const QuestChain = ({ questId, status = {}, onSelect }) => {
  const db = useMemo(() => getDb(), [])
  const [upDepth, setUpDepth] = useState(DEFAULT_DEPTH)
  const [downDepth, setDownDepth] = useState(DEFAULT_DEPTH)
  const [hover, setHover] = useState(null)

  // 切换任务时重置展开层数
  useEffect(() => {
    setUpDepth(DEFAULT_DEPTH)
    setDownDepth(DEFAULT_DEPTH)
  }, [questId])

  const layout = useMemo(
    () => computeChainLayout(questId, { upDepth, downDepth }),
    [questId, upDepth, downDepth],
  )

  if (!layout) return null
  const { nodes, edges, width, height, moreUp, moreDown, upCount, downCount } = layout

  if (nodes.length === 1) {
    return <Callout icon="info-sign">该任务是独立任务，无前置也无后续。</Callout>
  }

  // 高亮：悬停节点及其直接关联的边
  const isLit = (e) => hover != null && (e.from === hover || e.to === hover)

  return (
    <Wrap>
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
        <Hint>
          前置 {upCount} ｜ 后续 {downCount} ｜ 第 {db.quests[questId].depth + 1} 级
          {(moreUp || moreDown) && ' ｜ 还有未展开的层级'}
        </Hint>
      </Toolbar>

      <Canvas>
        <svg width={width} height={height} style={{ display: 'block' }}>
          {/* 连线先画，压在节点下方 */}
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
                  $focus={n.isFocus}
                  onClick={() => !n.isFocus && onSelect?.(n.id)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>
                    {`[${q.wikiId || q.id}] ${q.name}\n${q.category} / ${q.period}`}
                  </title>
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
                  {/* 左侧类别色条 */}
                  <rect x={n.x} y={n.y} width={3} height={n.h} rx={1.5} fill={cat} />
                  <text
                    x={n.x + 8}
                    y={n.y + 11}
                    fontSize={9}
                    fill={cat}
                    fontFamily="monospace"
                  >
                    {fitToWidth(q.wikiId || String(q.id), n.w)}
                  </text>
                  <text
                    x={n.x + 8}
                    y={n.y + 21}
                    fontSize={10}
                    fill="currentColor"
                    opacity={0.85}
                  >
                    {fitToWidth(q.name, n.w)}
                  </text>
                </NodeG>
              )
            })}
          </g>
        </svg>
      </Canvas>
    </Wrap>
  )
}

export default QuestChain
