/**
 * 任务进度面板：展示 poi 已算好的达成进度。
 *
 * **纯读取**：数据来自 poi 的 store.info.quests.records，
 * 本插件不拦截游戏事件、不自行统计、更不向游戏发送任何请求。
 *
 * poi 覆盖 104 个任务（日常 95.8% / 周常 90.5% / 季常·年常约 67% / 单次 0%），
 * 未覆盖的任务这里会明确说明「无自动追踪」，避免用户误以为进度是 0。
 */
import React from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'
import { Tag, ProgressBar, Intent, Icon } from '@blueprintjs/core'
import { parseProgress, describeExtraGoal, EVENT_ITEMS, COMMON_ITEMS, readItemCounts } from '../lib/quest-progress.es'
import { questRecordsSelector } from '../redux/selectors.es'

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
`

const Label = styled.span`
  flex: 1;
  opacity: ${(p) => (p.$done ? 0.55 : 0.95)};
  text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
`

const BarWrap = styled.div`
  flex: 0 0 110px;
`

const Num = styled.span`
  flex: 0 0 auto;
  font-family: monospace;
  font-size: 12px;
  opacity: 0.8;
  min-width: 52px;
  text-align: right;
`

const Note = styled.div`
  font-size: 12px;
  opacity: 0.5;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 0;
`

const Items = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
`

export const QuestProgress = ({ quest }) => {
  const records = useSelector(questRecordsSelector)
  const progress = parseProgress(records?.[quest?.id])

  if (!quest) return null

  if (!progress) {
    // poi 未收录时，若本插件有补充的达成要求，至少把要求讲清楚
    const extra = describeExtraGoal(quest.id)
    if (extra) {
      return (
        <div>
          {extra.items.map((it) => (
            <Row key={it.key}>
              <Label>
                {it.description}
                {it.maps.map((m) => (
                  <Tag key={m} minimal style={{ marginLeft: 6, fontSize: 10 }}>
                    {m}
                  </Tag>
                ))}
              </Label>
              <Num>需 {it.required} 次</Num>
            </Row>
          ))}
          <Note>
            <Icon icon="info-sign" size={12} />
            达成要求由任务说明推断，**无自动计数**（poi 的追踪数据未收录此任务）
          </Note>
        </div>
      )
    }
    return (
      <Note>
        <Icon icon="info-sign" size={12} />
        该任务无自动进度追踪
        {quest.period === '单次'
          ? '（单次任务通常是一次性达成，可在达成路径里手动打勾）'
          : '（poi 的追踪数据未收录此任务）'}
      </Note>
    )
  }

  const { total, subgoals, singleGoal } = progress

  return (
    <div>
      {!singleGoal && total.required > 0 && (
        <Row>
          <Label $done={progress.done}>
            <b>总进度</b>
          </Label>
          <BarWrap>
            <ProgressBar
              value={total.required ? total.count / total.required : 0}
              intent={progress.done ? Intent.SUCCESS : Intent.PRIMARY}
              stripes={false}
              animate={false}
            />
          </BarWrap>
          <Num>
            {total.count}/{total.required}
          </Num>
        </Row>
      )}

      {subgoals.map((g) => (
        <Row key={g.key}>
          <Label $done={g.done}>
            {g.description}
            {/* 分海域计数时把海域标出来，如 1-2 / 2-3 */}
            {g.group && /^\d{2,3}$/.test(g.group) && (
              <Tag minimal style={{ marginLeft: 6, fontSize: 10 }}>
                {g.group.length === 2
                  ? `${g.group[0]}-${g.group[1]}`
                  : `${g.group.slice(0, -1)}-${g.group.slice(-1)}`}
              </Tag>
            )}
          </Label>
          <BarWrap>
            <ProgressBar
              value={g.required ? Math.min(1, g.count / g.required) : 0}
              intent={g.done ? Intent.SUCCESS : Intent.WARNING}
              stripes={false}
              animate={false}
            />
          </BarWrap>
          <Num>
            {g.count}/{g.required}
          </Num>
        </Row>
      ))}
    </div>
  )
}

/** 活动 / 常用道具持有量。任务常以这些道具为达成前提或奖励 */
export const ItemCounts = () => {
  const event = useSelector((s) => readItemCounts(s, EVENT_ITEMS))
  const common = useSelector((s) => readItemCounts(s, COMMON_ITEMS))

  if (!event.length && !common.length) {
    return (
      <Note>
        <Icon icon="info-sign" size={12} />
        暂无道具数据（游戏加载后显示）
      </Note>
    )
  }

  return (
    <div>
      {event.length > 0 && (
        <>
          <Note>限时 / 活动道具</Note>
          <Items>
            {event.map((it) => (
              <Tag key={it.id} intent={Intent.WARNING} minimal>
                {it.name} × {it.count}
              </Tag>
            ))}
          </Items>
        </>
      )}
      {common.length > 0 && (
        <>
          <Note style={{ marginTop: 8 }}>常用消耗品</Note>
          <Items>
            {common.map((it) => (
              <Tag key={it.id} minimal>
                {it.name} × {it.count}
              </Tag>
            ))}
          </Items>
        </>
      )}
      <Note style={{ marginTop: 6 }}>
        数量取自 poi 的道具接口，poi 源码注明该接口不完整、更新未必及时，仅供参考。
      </Note>
    </div>
  )
}

export default QuestProgress
