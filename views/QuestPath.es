/**
 * 达成路径视图：选定目标任务，按「波次」列出还需完成哪些任务、按什么顺序。
 *
 * 第 1 波是现在就能做的，做完解锁第 2 波，依此类推。
 * 每个任务可手动打勾标记已完成 —— 游戏 API 不提供历史记录，
 * 自动推断只是下界，这里让玩家补齐。
 */
import React, { useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import styled from 'styled-components'
import { Tag, Button, Callout, ProgressBar, Intent, Checkbox } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { computeQuestPath } from '../lib/quest-path.es'
import {
  completedIdsSelector,
  manualDoneSelector,
  STATUS,
} from '../redux/selectors.es'
import { toggleManualDone } from '../redux/reducer.es'

const Root = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 4px 2px;
`

const Summary = styled.div`
  margin-bottom: 12px;
`

const Stat = styled.div`
  font-size: 12.5px;
  opacity: 0.75;
  margin: 6px 0;
`

const Wave = styled.div`
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 2px solid ${(p) => (p.$first ? '#ffb366' : 'rgba(255,255,255,0.12)')};
`

const WaveHead = styled.div`
  font-size: 12.5px;
  font-weight: 600;
  opacity: ${(p) => (p.$first ? 1 : 0.6)};
  color: ${(p) => (p.$first ? '#ffb366' : 'inherit')};
  margin-bottom: 5px;
`

const QuestRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 4px;
  border-radius: 3px;
  font-size: 13px;
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

const QName = styled.span`
  flex: 1;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &:hover {
    text-decoration: underline;
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

const INITIAL_WAVES = 5

export const QuestPath = ({ targetId, onSelect }) => {
  const db = useMemo(() => getDb(), [])
  const dispatch = useDispatch()
  const completed = useSelector(completedIdsSelector)
  const manual = useSelector(manualDoneSelector)
  const [shown, setShown] = useState(INITIAL_WAVES)

  const path = useMemo(
    () => (targetId != null ? computeQuestPath(targetId, completed) : null),
    [targetId, completed],
  )

  // 目标变化时重置展开
  const [lastTarget, setLastTarget] = useState(targetId)
  if (lastTarget !== targetId) {
    setLastTarget(targetId)
    setShown(INITIAL_WAVES)
  }

  if (!path) return null

  const target = db.quests[targetId]
  const pct = path.totalInChain ? path.doneCount / path.totalInChain : 0

  if (path.alreadyDone) {
    return (
      <Root>
        <Callout intent={Intent.SUCCESS} icon="endorsed" title="目标已达成">
          「{target.name}」及其全部 {path.totalInChain - 1} 个前置任务都已完成。
        </Callout>
      </Root>
    )
  }

  const visible = path.waves.slice(0, shown)
  const restWaves = path.waves.length - visible.length
  const restQuests = path.waves.slice(shown).reduce((n, w) => n + w.length, 0)

  const periodText = Object.entries(path.periodStats)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' ｜ ')

  return (
    <Root>
      <Summary>
        <Stat>
          距离「{target.name}」还需完成 <b>{path.total}</b> 个任务，
          分 <b>{path.waves.length}</b> 步
        </Stat>
        <ProgressBar
          value={pct}
          intent={Intent.PRIMARY}
          stripes={false}
          animate={false}
        />
        <Stat>
          整条链共 {path.totalInChain} 个任务，已完成 {path.doneCount}（{Math.round(pct * 100)}%）
        </Stat>
        {periodText && <Stat>待办构成：{periodText}</Stat>}
      </Summary>

      {visible.map((wave, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Wave key={i} $first={i === 0}>
          <WaveHead $first={i === 0}>
            {i === 0 ? `第 1 步 · 现在就能做（${wave.length}）` : `第 ${i + 1} 步（${wave.length}）`}
          </WaveHead>
          {wave.map((id) => {
            const q = db.quests[id]
            if (!q) return null
            return (
              <QuestRow key={id}>
                <Checkbox
                  checked={false}
                  onChange={() => dispatch(toggleManualDone(id))}
                  style={{ margin: 0 }}
                  title="标记为已完成"
                />
                <Tag
                  minimal
                  style={{ color: CAT_COLOR[q.category], fontSize: 11, minWidth: 52 }}
                >
                  {q.wikiId || q.id}
                </Tag>
                <QName title={q.name} onClick={() => onSelect?.(id)}>
                  {q.name}
                </QName>
                {q.period !== '单次' && (
                  <Tag minimal style={{ fontSize: 10 }}>
                    {q.period}
                  </Tag>
                )}
                {id === targetId && (
                  <Tag intent={Intent.DANGER} style={{ fontSize: 10 }}>
                    目标
                  </Tag>
                )}
              </QuestRow>
            )
          })}
        </Wave>
      ))}

      {restWaves > 0 && (
        <Button
          minimal
          small
          icon="chevron-down"
          onClick={() => setShown((n) => n + 10)}
        >
          还有 {restWaves} 步 / {restQuests} 个任务，展开
        </Button>
      )}

      <Callout style={{ marginTop: 14, padding: '7px 10px', fontSize: 12 }}>
        完成情况由游戏数据自动推断，可能不全（游戏不提供历史完成记录）。
        勾选左侧方框可手动标记为已完成，路径会随之重算。
        {manual.size > 0 && ` 当前已手动标记 ${manual.size} 个。`}
      </Callout>
    </Root>
  )
}

export default QuestPath
