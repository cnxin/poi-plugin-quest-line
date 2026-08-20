/**
 * 编成要求面板：展示 DSL 条件，并在游戏已加载时对照当前舰队实时判定。
 */
import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'
import { Tag, Callout, Icon } from '@blueprintjs/core'
import { evaluateFleetReq, describeCondition, readFleet } from '../lib/fleet-check.es'

const Line = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  padding: 4px 0;
`

const Desc = styled.span`
  flex: 1;
`

const FleetPicker = styled.div`
  font-size: 12.5px;
  opacity: 0.55;
  margin-bottom: 6px;
`

export const FleetReqPanel = ({ quest, fleetIndex = 0 }) => {
  const fleet = useSelector((state) => readFleet(state, fleetIndex))
  const evaluated = useMemo(
    () => evaluateFleetReq(quest?.fleetReq, fleet),
    [quest, fleet],
  )

  if (!quest?.fleetReq?.length) return null

  // 游戏未加载时只列条件，不做判定（避免显示成"全部不满足"误导）
  const hasFleet = fleet.length > 0

  return (
    <div>
      <FleetPicker>
        {hasFleet
          ? `对照第 ${fleetIndex + 1} 舰队（${fleet.length} 艘）`
          : '游戏未加载，仅显示要求'}
      </FleetPicker>

      {!hasFleet &&
        quest.fleetReq.map((cond, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Line key={i}>
            <Icon icon="dot" size={10} style={{ opacity: 0.4 }} />
            <Desc>{describeCondition(cond)}</Desc>
          </Line>
        ))}

      {hasFleet && (
        <>
          {evaluated.results.map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Line key={i}>
              <Icon
                icon={r.ok ? 'tick-circle' : 'circle'}
                size={12}
                intent={r.ok ? 'success' : 'none'}
                style={{ opacity: r.ok ? 1 : 0.4 }}
              />
              <Desc style={{ opacity: r.ok ? 1 : 0.7 }}>{r.desc}</Desc>
              <Tag minimal intent={r.ok ? 'success' : 'warning'} style={{ fontSize: 10 }}>
                {r.have} / {r.op}
                {r.need}
              </Tag>
            </Line>
          ))}
          <Callout
            intent={evaluated.ok ? 'success' : 'warning'}
            icon={evaluated.ok ? 'endorsed' : 'warning-sign'}
            style={{ marginTop: 8, padding: '6px 10px', fontSize: 12 }}
          >
            {evaluated.ok ? '当前编成满足要求' : '当前编成不满足要求'}
          </Callout>
        </>
      )}
    </div>
  )
}

export default FleetReqPanel
