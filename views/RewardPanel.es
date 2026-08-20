/**
 * 奖励明细面板：资源 / 固定奖励 / 选择奖励（分组）
 */
import React from 'react'
import styled from 'styled-components'
import { Tag, Callout } from '@blueprintjs/core'
import {
  describeResource,
  describeFixed,
  describeChoice,
} from '../lib/reward.es'

const Section = styled.div`
  margin-bottom: 10px;
`

const SectionTitle = styled.div`
  font-size: 13px;
  opacity: 0.7;
  margin-bottom: 4px;
`

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const ChoiceGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-bottom: 4px;
`

const GroupLabel = styled.span`
  font-size: 12.5px;
  opacity: 0.6;
  min-width: 42px;
`

export const RewardPanel = ({ quest }) => {
  if (!quest) return null

  const resources = describeResource(quest.resource)
  const fixed = describeFixed(quest.fixedReward)
  const choices = describeChoice(quest.choiceReward)
  const hasStructured = resources.length || fixed.length || choices.length

  return (
    <div>
      {resources.length > 0 && (
        <Section>
          <SectionTitle>资源</SectionTitle>
          <TagRow>
            {resources.map((r) => (
              <Tag key={r.label} minimal intent="primary">
                {r.label} {r.value}
              </Tag>
            ))}
          </TagRow>
        </Section>
      )}

      {fixed.length > 0 && (
        <Section>
          <SectionTitle>固定奖励</SectionTitle>
          <TagRow>
            {fixed.map((t, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Tag key={i} minimal intent="success">
                {t}
              </Tag>
            ))}
          </TagRow>
        </Section>
      )}

      {choices.length > 0 && (
        <Section>
          <SectionTitle>选择奖励（每组任选其一）</SectionTitle>
          {choices.map((group, gi) => (
            // eslint-disable-next-line react/no-array-index-key
            <ChoiceGroup key={gi}>
              <GroupLabel>第 {gi + 1} 组</GroupLabel>
              {group.map((t, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Tag key={i} minimal intent="warning">
                  {t}
                </Tag>
              ))}
            </ChoiceGroup>
          ))}
        </Section>
      )}

      {!hasStructured && quest.rewardText && (
        <Section>
          <SectionTitle>奖励</SectionTitle>
          <Callout>{quest.rewardText}</Callout>
        </Section>
      )}

      {!hasStructured && !quest.rewardText && (
        <Callout intent="none">该任务暂无奖励数据</Callout>
      )}
    </div>
  )
}

export default RewardPanel
