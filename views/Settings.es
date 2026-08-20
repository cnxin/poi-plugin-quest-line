import React, { useMemo } from 'react'
import styled from 'styled-components'
import { Callout, Tag } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'

const Wrapper = styled.div`
  padding: 8px;
`

const Row = styled.div`
  margin: 6px 0;
  font-size: 12px;
`

export const Settings = () => {
  const meta = useMemo(() => getDb().meta ?? {}, [])
  return (
    <Wrapper>
      <Callout title="数据来源" icon="database">
        <Row>
          任务数：<Tag minimal>{meta.questCount}</Tag> ｜ 前置边：
          <Tag minimal>{meta.edges}</Tag> ｜ 最长链：<Tag minimal>{meta.maxDepth}</Tag> 级
        </Row>
        <Row>数据源：{(meta.sources ?? []).join(' + ')}</Row>
        <Row>生成时间：{meta.generatedAt}</Row>
        <Row style={{ opacity: 0.7 }}>
          任务数据整理自舰C wiki 社区（kanxy 静态数据 / kcwikizh·kcQuests /
          antest1·kcanotify-gamedata）。更新数据请运行 <code>npm run build-data</code>。
        </Row>
      </Callout>
    </Wrapper>
  )
}

export default Settings
