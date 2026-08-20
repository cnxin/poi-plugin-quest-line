/**
 * 完整任务线视图：以焦点任务为中心，向上展开全部前置层级、向下展开全部后继层级。
 *
 * 布局按「链深度」分层（BFS 分层），最长链 26 级，因此：
 *   - 默认只展开上下各 2 层，可逐层「展开更多」
 *   - 焦点任务高亮居中
 */
import React, { useMemo, useState } from 'react'
import styled from 'styled-components'
import { Tag, Button, Callout } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { STATUS } from '../redux/selectors.es'

const Wrapper = styled.div`
  font-size: 12px;
`

const Layer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 0;
  align-items: center;
`

const LayerLabel = styled.div`
  font-size: 10px;
  opacity: 0.5;
  min-width: 62px;
  flex: 0 0 auto;
`

const FocusRow = styled(Layer)`
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  margin: 3px 0;
  padding: 6px 0;
`

const Hint = styled.div`
  font-size: 11px;
  opacity: 0.55;
  margin: 4px 0;
`

const STATUS_INTENT = {
  [STATUS.COMPLETED]: 'success',
  [STATUS.IN_PROGRESS]: 'primary',
  [STATUS.AVAILABLE]: 'warning',
  [STATUS.LOCKED]: 'none',
}

/**
 * 从起点按方向做 BFS 分层。
 * dir: 'prereqIds'（向上找前置）| 'unlocks'（向下找后继）
 * 返回 [[第1层id...], [第2层id...], ...]
 */
function bfsLayers(startId, dir, maxLayers, quests) {
  const layers = []
  let frontier = [startId]
  const seen = new Set([startId])
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

/** 是否还有更深的层没展开 */
function hasMore(layers, startId, dir, quests) {
  const seen = new Set([startId])
  layers.flat().forEach((i) => seen.add(i))
  const last = layers[layers.length - 1] ?? [startId]
  return last.some((id) => (quests[id]?.[dir] ?? []).some((n) => !seen.has(n)))
}

const DEFAULT_DEPTH = 2

export const QuestChain = ({ questId, status = {}, onSelect }) => {
  const db = useMemo(() => getDb(), [])
  const [upDepth, setUpDepth] = useState(DEFAULT_DEPTH)
  const [downDepth, setDownDepth] = useState(DEFAULT_DEPTH)

  const quests = db.quests
  const focus = quests[questId]

  // questId 变化时重置展开层数
  const [lastId, setLastId] = useState(questId)
  if (lastId !== questId) {
    setLastId(questId)
    setUpDepth(DEFAULT_DEPTH)
    setDownDepth(DEFAULT_DEPTH)
  }

  const upLayers = useMemo(
    () => bfsLayers(questId, 'prereqIds', upDepth, quests),
    [questId, upDepth, quests],
  )
  const downLayers = useMemo(
    () => bfsLayers(questId, 'unlocks', downDepth, quests),
    [questId, downDepth, quests],
  )

  if (!focus) return null

  const moreUp = hasMore(upLayers, questId, 'prereqIds', quests)
  const moreDown = hasMore(downLayers, questId, 'unlocks', quests)

  const totalUp = upLayers.reduce((n, l) => n + l.length, 0)
  const totalDown = downLayers.reduce((n, l) => n + l.length, 0)

  const renderTag = (id, isFocus = false) => {
    const q = quests[id]
    if (!q) return null
    return (
      <Tag
        key={id}
        minimal={!isFocus}
        interactive={!isFocus}
        intent={isFocus ? 'danger' : STATUS_INTENT[status[id]] ?? 'none'}
        onClick={isFocus ? undefined : () => onSelect?.(id)}
        title={q.name}
      >
        {q.wikiId || q.id} {q.name}
      </Tag>
    )
  }

  if (!totalUp && !totalDown) {
    return <Callout icon="info-sign">该任务是独立任务，无前置也无后续。</Callout>
  }

  return (
    <Wrapper>
      <Hint>
        前置 {totalUp} 个 ｜ 后续 {totalDown} 个 ｜ 本任务处于任务链第 {focus.depth + 1} 级
      </Hint>

      {/* 前置：由远及近，最远的在最上面 */}
      {[...upLayers].reverse().map((layer, i) => {
        const level = upLayers.length - i
        return (
          <Layer key={`up-${level}`}>
            <LayerLabel>前置 -{level}</LayerLabel>
            {layer.map((id) => renderTag(id))}
          </Layer>
        )
      })}
      {moreUp && (
        <Layer>
          <LayerLabel />
          <Button small minimal icon="chevron-up" onClick={() => setUpDepth((d) => d + 2)}>
            展开更早的前置
          </Button>
        </Layer>
      )}

      <FocusRow>
        <LayerLabel>当前</LayerLabel>
        {renderTag(questId, true)}
      </FocusRow>

      {downLayers.map((layer, i) => (
        <Layer key={`down-${i}`}>
          <LayerLabel>后续 +{i + 1}</LayerLabel>
          {layer.map((id) => renderTag(id))}
        </Layer>
      ))}
      {moreDown && (
        <Layer>
          <LayerLabel />
          <Button small minimal icon="chevron-down" onClick={() => setDownDepth((d) => d + 2)}>
            展开更远的后续
          </Button>
        </Layer>
      )}
    </Wrapper>
  )
}

export default QuestChain
