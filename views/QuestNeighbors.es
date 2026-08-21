/**
 * 任务浏览页里的轻量前置/后继展示。
 * 只列直接相邻的任务（标签形式），完整任务链请走独立的「任务线」页面
 * —— 图挤在详情面板里太小、看不清也拖不动。
 */
import React, { useMemo } from 'react'
import styled from 'styled-components'
import { Tag, Button } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { STATUS } from '../redux/selectors.es'

const Group = styled.div`
  margin-bottom: 8px;
`

const Label = styled.div`
  font-size: 12.5px;
  opacity: 0.5;
  margin-bottom: 4px;
`

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const Bar = styled.div`
  margin-top: 10px;
`

const STATUS_INTENT = {
  [STATUS.COMPLETED]: 'success',
  [STATUS.IN_PROGRESS]: 'primary',
  [STATUS.AVAILABLE]: 'warning',
  [STATUS.LOCKED]: 'none',
}

export const QuestNeighbors = ({ quest, status = {}, onSelect, onOpenChain, onOpenPath }) => {
  const db = useMemo(() => getDb(), [])
  if (!quest) return null

  const tag = (id) => {
    const q = db.quests[id]
    if (!q) return null
    return (
      <Tag
        key={id}
        minimal
        interactive
        intent={STATUS_INTENT[status[id]] ?? 'none'}
        onClick={() => onSelect?.(id)}
        title={q.name}
      >
        {q.wikiId || id} {q.name}
      </Tag>
    )
  }

  const hasChain = quest.prereqIds?.length > 0 || quest.unlocks?.length > 0

  return (
    <div>
      {quest.prereqIds?.length > 0 && (
        <Group>
          <Label>前置任务（{quest.prereqIds.length}）</Label>
          <Row>{quest.prereqIds.map(tag)}</Row>
        </Group>
      )}
      {quest.unlocks?.length > 0 && (
        <Group>
          <Label>解锁后续（{quest.unlocks.length}）</Label>
          <Row>{quest.unlocks.map(tag)}</Row>
        </Group>
      )}
      {!hasChain && <Label>该任务是独立任务，无前置也无后续。</Label>}

      {hasChain && (
        <Bar>
          <Button small icon="flow-branch" onClick={() => onOpenChain?.(quest.id)}>
            查看完整任务线
          </Button>
          {quest.prereqIds?.length > 0 && (
            <Button
              small
              icon="route"
              style={{ marginLeft: 6 }}
              onClick={() => onOpenPath?.(quest.id)}
            >
              我要做这个：看达成路径
            </Button>
          )}
        </Bar>
      )}
    </div>
  )
}

export default QuestNeighbors
