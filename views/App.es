/**
 * 主面板布局：
 *   ┌──────────────────────────────────────────┐
 *   │ 搜索框                        [统计]      │
 *   │ 类别: ○ ○ ○   周期: ○ ○   状态: ○ ○      │  ← 带标签的紧凑筛选行
 *   ├─────────────┬────────────────────────────┤
 *   │ 任务列表     │ 详情（说明/奖励/任务线）    │
 *   └─────────────┴────────────────────────────┘
 */
import React, { useMemo, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'
import { InputGroup, Tag, Button, Callout, Icon } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { rewardSearchText } from '../lib/reward.es'
import { questStatusSelector, STATUS } from '../redux/selectors.es'
import RewardPanel from './RewardPanel.es'
import QuestNeighbors from './QuestNeighbors.es'
import ChainPage from './ChainPage.es'
import RewardLookup from './RewardLookup.es'
import FleetReqPanel from './FleetReqPanel.es'

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 14px;
`

const TopBar = styled.div`
  flex: 0 0 auto;
  padding: 6px 8px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`

const FilterLine = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
  margin-top: 4px;
`

const FilterLabel = styled.span`
  font-size: 12px;
  opacity: 0.45;
  flex: 0 0 auto;
  width: 34px;
  letter-spacing: 1px;
`

/** 紧凑筛选片，比 Button 更省空间 */
const Chip = styled.button`
  border: none;
  border-radius: 3px;
  padding: 3px 9px;
  font-size: 13px;
  cursor: pointer;
  background: ${(p) => (p.$on ? 'rgba(72,175,240,0.85)' : 'rgba(255,255,255,0.07)')};
  color: ${(p) => (p.$on ? '#fff' : 'inherit')};
  opacity: ${(p) => (p.$on ? 1 : 0.75)};
  transition: background 0.12s;
  &:hover {
    background: ${(p) => (p.$on ? 'rgba(72,175,240,0.95)' : 'rgba(255,255,255,0.14)')};
    opacity: 1;
  }
`

const Body = styled.div`
  flex: 1;
  display: flex;
  min-height: 0;
`

const Left = styled.div`
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
`

const Right = styled.div`
  flex: 1;
  overflow-y: auto;
  min-width: 0;
  padding: 10px 12px;
`

const ListScroll = styled.div`
  flex: 1;
  overflow-y: auto;
`

const Row = styled.div`
  padding: 0 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  border-left: 2px solid ${(p) => p.$accent};
  background: ${(p) => (p.$active ? 'rgba(72,175,240,0.16)' : 'transparent')};
  &:hover {
    background: ${(p) => (p.$active ? 'rgba(72,175,240,0.2)' : 'rgba(255,255,255,0.05)')};
  }
`

const WikiId = styled.span`
  font-family: monospace;
  font-size: 12px;
  opacity: 0.6;
  flex: 0 0 auto;
  width: 58px;
`

const RowName = styled.span`
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`

const Counter = styled.div`
  font-size: 12px;
  opacity: 0.45;
  padding: 3px 8px;
`

const Title = styled.div`
  font-size: 17px;
  font-weight: 600;
  margin: 6px 0 2px;
  line-height: 1.35;
`

const SubTitle = styled.div`
  font-size: 12.5px;
  opacity: 0.4;
`

const Section = styled.div`
  font-size: 13px;
  font-weight: 600;
  opacity: 0.55;
  margin: 14px 0 6px;
  letter-spacing: 1px;
`

const Desc = styled.div`
  font-size: 14px;
  line-height: 1.75;
  opacity: 0.9;
`

const Memo = styled.div`
  margin-top: 8px;
  padding: 7px 10px;
  border-left: 2px solid rgba(72, 175, 240, 0.6);
  background: rgba(72, 175, 240, 0.07);
  border-radius: 0 3px 3px 0;
  font-size: 13.5px;
  line-height: 1.7;
`

const MemoLabel = styled.div`
  font-size: 11.5px;
  opacity: 0.55;
  margin-bottom: 3px;
`

const AltDesc = styled.div`
  margin-top: 6px;
  font-size: 12.5px;
  opacity: 0.5;
  line-height: 1.6;
`

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.4;
  gap: 10px;
  font-size: 13.5px;
`

/** 类别配色（也用于列表行左侧色条） */
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
/** 游戏内的类别顺序，「其他」永远垫底 */
const CAT_ORDER = ['编成', '出击', '演习', '远征', '补给/入渠', '工厂', '改装', '其他']
const PERIOD_ORDER = ['单次', '日常', '周常', '月常', '季常', '年常', '特殊']

const STATUS_INTENT = {
  [STATUS.COMPLETED]: 'success',
  [STATUS.IN_PROGRESS]: 'primary',
  [STATUS.AVAILABLE]: 'warning',
  [STATUS.LOCKED]: 'none',
}
const STATUS_LABEL = {
  [STATUS.COMPLETED]: '已完成',
  [STATUS.IN_PROGRESS]: '进行中',
  [STATUS.AVAILABLE]: '可接取',
  [STATUS.LOCKED]: '未解锁',
}

const ROW_HEIGHT = 30
const OVERSCAN = 12
const ALL = '__all__'

const MODE = { BROWSE: 'browse', CHAIN: 'chain', REWARD: 'reward' }

const ModeTabs = styled.div`
  display: flex;
  gap: 2px;
  margin-bottom: 5px;
`

const ModeTab = styled.button`
  border: none;
  background: none;
  border-bottom: 2px solid ${(p) => (p.$on ? '#48aff0' : 'transparent')};
  color: inherit;
  opacity: ${(p) => (p.$on ? 1 : 0.5)};
  font-size: 14px;
  padding: 4px 12px 5px;
  cursor: pointer;
  &:hover {
    opacity: 1;
  }
`

export const App = () => {
  const db = useMemo(() => getDb(), [])
  const [mode, setMode] = useState(MODE.BROWSE)
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [category, setCategory] = useState(ALL)
  const [period, setPeriod] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)

  const status = useSelector(questStatusSelector)

  const categories = useMemo(
    () => CAT_ORDER.filter((c) => (db.meta?.categories ?? []).includes(c)),
    [db],
  )
  const periods = useMemo(
    () => PERIOD_ORDER.filter((p) => (db.meta?.periods ?? []).includes(p)),
    [db],
  )

  const searchIndex = useMemo(() => {
    const idx = {}
    for (const id of db.ids) {
      const q = db.quests[id]
      idx[id] =
        `${q.wikiId} ${q.name} ${q.nameJa ?? ''} ${q.desc} ${rewardSearchText(q)}`.toLowerCase()
    }
    return idx
  }, [db])

  const visibleIds = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return db.ids.filter((id) => {
      const q = db.quests[id]
      if (category !== ALL && q.category !== category) return false
      if (period !== ALL && q.period !== period) return false
      if (statusFilter !== ALL && status[id] !== statusFilter) return false
      if (!kw) return true
      return searchIndex[id]?.includes(kw)
    })
  }, [db, keyword, searchIndex, category, period, statusFilter, status])

  const onScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop)
    setViewportH(e.currentTarget.clientHeight)
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(visibleIds.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN)
  const slice = visibleIds.slice(start, end)
  const quest = selected != null ? db.quests[selected] : null

  const chip = (label, value, current, setter, key) => (
    <Chip key={key ?? String(value)} $on={current === value} onClick={() => setter(value)}>
      {label}
    </Chip>
  )

  return (
    <Root>
      <TopBar>
        <ModeTabs>
          <ModeTab $on={mode === MODE.BROWSE} onClick={() => setMode(MODE.BROWSE)}>
            任务浏览
          </ModeTab>
          <ModeTab $on={mode === MODE.CHAIN} onClick={() => setMode(MODE.CHAIN)}>
            任务线
          </ModeTab>
          <ModeTab $on={mode === MODE.REWARD} onClick={() => setMode(MODE.REWARD)}>
            按奖励查任务
          </ModeTab>
        </ModeTabs>

        {mode === MODE.BROWSE && (
          <>
            <InputGroup
              fill
              leftIcon="search"
              placeholder="搜索任务名 / wiki编号 / 说明 / 奖励（如：螺丝）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              rightElement={
                keyword ? (
                  <Button minimal small icon="cross" onClick={() => setKeyword('')} />
                ) : undefined
              }
            />
            <FilterLine>
              <FilterLabel>类别</FilterLabel>
              {chip('全部', ALL, category, setCategory, 'cat-all')}
              {categories.map((c) => chip(c, c, category, setCategory))}
            </FilterLine>
            <FilterLine>
              <FilterLabel>周期</FilterLabel>
              {chip('全部', ALL, period, setPeriod, 'per-all')}
              {periods.map((p) => chip(p, p, period, setPeriod))}
            </FilterLine>
            <FilterLine>
              <FilterLabel>状态</FilterLabel>
              {chip('全部', ALL, statusFilter, setStatusFilter, 'st-all')}
              {[STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.COMPLETED, STATUS.LOCKED].map((s) =>
                chip(STATUS_LABEL[s], s, statusFilter, setStatusFilter),
              )}
            </FilterLine>
          </>
        )}
      </TopBar>

      {mode === MODE.CHAIN && (
        <Body>
          <ChainPage
            questId={selected}
            status={status}
            onSelect={setSelected}
            onBack={() => setMode(MODE.BROWSE)}
          />
        </Body>
      )}

      {mode === MODE.REWARD && (
        <Body>
          <RewardLookup
            status={status}
            onSelectQuest={(id) => {
              setSelected(id)
              setMode(MODE.BROWSE)
            }}
          />
        </Body>
      )}

      {mode === MODE.BROWSE && (
      <Body>
        <Left>
          <Counter>
            {visibleIds.length} 个任务
            {visibleIds.length !== db.ids.length ? ` / 共 ${db.ids.length}` : ''}
          </Counter>
          <ListScroll onScroll={onScroll}>
            <div style={{ height: visibleIds.length * ROW_HEIGHT, position: 'relative' }}>
              <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
                {slice.map((id) => {
                  const q = db.quests[id]
                  return (
                    <Row
                      key={id}
                      $active={id === selected}
                      $accent={CAT_COLOR[q.category] ?? 'transparent'}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => setSelected(id)}
                    >
                      <WikiId>{q.wikiId || q.id}</WikiId>
                      <RowName title={q.name}>{q.name}</RowName>
                      {/* 615/774 是单次，标出来只会是噪音，只显示周期性任务 */}
                      {q.period !== '单次' && (
                        <Tag minimal style={{ fontSize: 11, padding: '1px 5px' }}>
                          {q.period}
                        </Tag>
                      )}
                    </Row>
                  )
                })}
              </div>
            </div>
          </ListScroll>
        </Left>

        <Right>
          {!quest && (
            <Empty>
              <Icon icon="flow-branch" size={28} />
              <div>选择左侧任务，查看完整任务链与奖励</div>
              <div style={{ fontSize: 12.5 }}>
                {db.meta?.questCount} 个任务 ｜ {db.meta?.edges} 条前置关系 ｜ 最长链{' '}
                {db.meta?.maxDepth} 级
              </div>
            </Empty>
          )}

          {quest && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Tag
                  style={{
                    background: CAT_COLOR[quest.category] ?? '#666',
                    color: '#111',
                    fontWeight: 600,
                  }}
                >
                  {quest.wikiId || quest.id}
                </Tag>
                <Tag minimal>{quest.category}</Tag>
                {quest.period !== '单次' && <Tag minimal>{quest.period}</Tag>}
                {quest.limited && (
                  <Tag minimal intent="danger">
                    期间限定
                  </Tag>
                )}
                <Tag minimal intent={STATUS_INTENT[status[quest.id]] ?? 'none'}>
                  {STATUS_LABEL[status[quest.id]] ?? '未知'}
                </Tag>
              </div>

              <Title>{quest.name}</Title>
              {quest.nameJa && quest.nameJa !== quest.name && <SubTitle>{quest.nameJa}</SubTitle>}

              <Section>任务说明</Section>
              <Desc
                // 说明文本含 <br>，来源为构建期静态数据，非用户输入
                dangerouslySetInnerHTML={{ __html: quest.desc || '（该任务无说明数据）' }}
              />
              {/* kcQuests 的 memo2：精确达成条件或补充提示，比 desc 更准
                  （如 B11 的「…出击一次」），覆盖 89% 的任务 */}
              {quest.memo && (
                <Memo>
                  <MemoLabel>达成条件 / 备注</MemoLabel>
                  <div dangerouslySetInnerHTML={{ __html: quest.memo }} />
                </Memo>
              )}
              {quest.descAlt && quest.descAlt !== quest.desc && (
                <AltDesc>另一数据源描述：{quest.descAlt}</AltDesc>
              )}

              <Section>奖励</Section>
              <RewardPanel quest={quest} />

              {quest.fleetReq?.length > 0 && (
                <>
                  <Section>编成要求</Section>
                  <FleetReqPanel quest={quest} />
                </>
              )}

              <Section>任务线</Section>
              <QuestNeighbors
                quest={quest}
                status={status}
                onSelect={setSelected}
                onOpenChain={(id) => {
                  setSelected(id)
                  setMode(MODE.CHAIN)
                }}
              />
            </>
          )}
        </Right>
      </Body>
      )}
    </Root>
  )
}

export default App
