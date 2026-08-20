/**
 * 奖励反查视图：选一个奖励物品 → 列出所有产出它的任务及完整前置路径。
 * 回答「我想要螺丝，该做哪些任务、要先做完什么」。
 */
import React, { useMemo, useState } from 'react'
import styled from 'styled-components'
import { InputGroup, Tag, Button, Icon } from '@blueprintjs/core'
import { getRewardIndex, searchRewards, questsForReward } from '../lib/reward-index.es'
import { getDb } from '../lib/quest-db.es'
import { STATUS } from '../redux/selectors.es'

const Wrap = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
`

const ItemPane = styled.div`
  flex: 0 0 190px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 0;
`

const ItemScroll = styled.div`
  flex: 1;
  overflow-y: auto;
`

const ItemRow = styled.div`
  padding: 4px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  background: ${(p) => (p.$active ? 'rgba(72,175,240,0.16)' : 'transparent')};
  &:hover {
    background: ${(p) => (p.$active ? 'rgba(72,175,240,0.2)' : 'rgba(255,255,255,0.05)')};
  }
`

const ItemName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Detail = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  min-width: 0;
`

const QuestCard = styled.div`
  border-left: 2px solid ${(p) => p.$accent};
  padding: 6px 10px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0 3px 3px 0;
`

const QuestHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  cursor: pointer;
`

const PathLine = styled.div`
  font-size: 12.5px;
  opacity: 0.6;
  margin-top: 5px;
  line-height: 1.7;
`

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.4;
  gap: 8px;
  font-size: 13.5px;
`

const Head = styled.div`
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
`

const Sub = styled.div`
  font-size: 12.5px;
  opacity: 0.55;
  margin-bottom: 10px;
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

const STATUS_INTENT = {
  [STATUS.COMPLETED]: 'success',
  [STATUS.IN_PROGRESS]: 'primary',
  [STATUS.AVAILABLE]: 'warning',
  [STATUS.LOCKED]: 'none',
}

export const RewardLookup = ({ status = {}, onSelectQuest }) => {
  const db = useMemo(() => getDb(), [])
  const [kw, setKw] = useState('')
  const [picked, setPicked] = useState(null)

  const items = useMemo(() => searchRewards(kw), [kw])
  const total = useMemo(() => getRewardIndex().items.length, [])
  const results = useMemo(() => (picked ? questsForReward(picked) : []), [picked])
  const pickedItem = picked ? getRewardIndex().byKey.get(picked) : null

  return (
    <Wrap>
      <ItemPane>
        <div style={{ padding: '6px 8px 4px' }}>
          <InputGroup
            fill
            small
            leftIcon="search"
            placeholder="奖励名（螺丝/女神…）"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            rightElement={
              kw ? <Button minimal small icon="cross" onClick={() => setKw('')} /> : undefined
            }
          />
          <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4 }}>
            {items.length} / {total} 种奖励
          </div>
        </div>
        <ItemScroll>
          {items.map((e) => (
            <ItemRow key={e.key} $active={e.key === picked} onClick={() => setPicked(e.key)}>
              <ItemName title={e.name}>{e.name}</ItemName>
              <Tag minimal style={{ fontSize: 9, padding: '0 4px' }}>
                {e.quests.length}
              </Tag>
            </ItemRow>
          ))}
        </ItemScroll>
      </ItemPane>

      <Detail>
        {!pickedItem && (
          <Empty>
            <Icon icon="gift" size={26} />
            <div>选择左侧奖励，查看哪些任务能产出</div>
          </Empty>
        )}

        {pickedItem && (
          <>
            <Head>{pickedItem.name}</Head>
            <Sub>
              共 {pickedItem.quests.length} 个任务产出
              {pickedItem.total > 0 && ` ｜ 固定奖励合计 ${pickedItem.total}`}
              {pickedItem.choiceTotal > 0 && ` ｜ 选择奖励合计 ${pickedItem.choiceTotal}`}
              　（按前置数量升序，越靠前越容易拿到）
            </Sub>

            {results.map((r) => {
              const q = r.quest
              return (
                <QuestCard key={`${r.id}-${r.choice}`} $accent={CAT_COLOR[q.category] ?? '#666'}>
                  <QuestHead onClick={() => onSelectQuest?.(r.id)}>
                    <Tag
                      style={{
                        background: CAT_COLOR[q.category] ?? '#666',
                        color: '#111',
                        fontWeight: 600,
                        fontSize: 10,
                      }}
                    >
                      {q.wikiId || q.id}
                    </Tag>
                    <span style={{ fontSize: 13.5 }}>{q.name}</span>
                    <Tag minimal intent={r.choice ? 'warning' : 'success'} style={{ fontSize: 9 }}>
                      {r.choice ? '选择' : '固定'} x{r.count}
                    </Tag>
                    {q.period !== '单次' && (
                      <Tag minimal style={{ fontSize: 9 }}>
                        {q.period}
                      </Tag>
                    )}
                    <Tag minimal intent={STATUS_INTENT[status[r.id]] ?? 'none'} style={{ fontSize: 9 }}>
                      {status[r.id] === STATUS.COMPLETED
                        ? '已完成'
                        : status[r.id] === STATUS.IN_PROGRESS
                          ? '进行中'
                          : status[r.id] === STATUS.AVAILABLE
                            ? '可接取'
                            : '未解锁'}
                    </Tag>
                  </QuestHead>

                  <PathLine>
                    {r.pathLength === 0 ? (
                      <span style={{ color: '#3dcc91' }}>无前置，可直接做</span>
                    ) : (
                      <>
                        需先完成 {r.pathLength} 个前置：
                        {r.path.slice(0, 12).map((p) => (
                          <Tag
                            key={p}
                            minimal
                            interactive
                            intent={STATUS_INTENT[status[p]] ?? 'none'}
                            style={{ fontSize: 9, margin: '0 2px' }}
                            onClick={() => onSelectQuest?.(p)}
                          >
                            {db.quests[p]?.wikiId || p}
                          </Tag>
                        ))}
                        {r.path.length > 12 && <span> …等 {r.path.length - 12} 个</span>}
                      </>
                    )}
                  </PathLine>
                </QuestCard>
              )
            })}
          </>
        )}
      </Detail>
    </Wrap>
  )
}

export default RewardLookup
