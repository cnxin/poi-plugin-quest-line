/**
 * 独立的任务线页面：整页显示 DAG，支持拖动与缩放。
 * 从任务浏览页点「查看完整任务线」进入，焦点跟随当前选中的任务。
 */
import React, { useMemo } from 'react'
import styled from 'styled-components'
import { Tag, Button, Callout } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import QuestChain from './QuestChain.es'

const Root = styled.div`
  display: flex;
  flex-direction: column;
  /* flex:1 + min-width:0 缺一不可：否则宽画布会把本容器整个撑大、
     超出父级后被 App 的 overflow:hidden 裁掉，Canvas 永远不产生滚动条（也就拖不动） */
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 8px;
  box-sizing: border-box;
  gap: 6px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 0 0 auto;
`

const Name = styled.span`
  font-size: 13px;
  font-weight: 600;
`

const Legend = styled.div`
  display: flex;
  gap: 10px;
  font-size: 10px;
  opacity: 0.5;
  flex: 0 0 auto;
`

const Swatch = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 2px;
    border: 1px solid ${(p) => p.$color};
    background: ${(p) => p.$fill ?? 'transparent'};
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

/** 独立页面空间充裕，每层可以多显示一些 */
const PAGE_MAX_PER_LAYER = 12

export const ChainPage = ({ questId, status = {}, onSelect, onBack }) => {
  const db = useMemo(() => getDb(), [])
  const quest = questId != null ? db.quests[questId] : null

  if (!quest) {
    return (
      <Root>
        <Callout icon="info-sign" title="未选择任务">
          请先在「任务浏览」中选择一个任务，再回到本页查看它的完整任务线。
          {onBack && (
            <div style={{ marginTop: 8 }}>
              <Button small icon="arrow-left" onClick={onBack}>
                去选择任务
              </Button>
            </div>
          )}
        </Callout>
      </Root>
    )
  }

  return (
    <Root>
      <Header>
        {onBack && <Button small minimal icon="arrow-left" onClick={onBack} title="返回任务浏览" />}
        <Tag
          style={{
            background: CAT_COLOR[quest.category] ?? '#666',
            color: '#111',
            fontWeight: 600,
          }}
        >
          {quest.wikiId || quest.id}
        </Tag>
        <Name>{quest.name}</Name>
        <Tag minimal>{quest.category}</Tag>
        {quest.period !== '单次' && <Tag minimal>{quest.period}</Tag>}
        <Legend>
          <Swatch $color="#3dcc91">已完成</Swatch>
          <Swatch $color="#48aff0">进行中</Swatch>
          <Swatch $color="#ffb366">可接取</Swatch>
          <Swatch $color="rgba(255,255,255,0.3)">未解锁</Swatch>
          <span>虚线 = 跨层依赖</span>
        </Legend>
      </Header>

      <QuestChain
        questId={quest.id}
        status={status}
        onSelect={onSelect}
        fill
        maxPerLayer={PAGE_MAX_PER_LAYER}
        initialDepth={3}
        defaultZoom={1}
      />
    </Root>
  )
}

export default ChainPage
