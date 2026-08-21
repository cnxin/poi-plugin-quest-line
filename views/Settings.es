import React, { useMemo, useState, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import styled from 'styled-components'
import { Callout, Tag, Button, Switch, Intent } from '@blueprintjs/core'
import { getDb, invalidateDb } from '../lib/quest-db.es'
import {
  titleLangSelector,
  followGameSelector,
  manualDoneSelector,
  favoritesSelector,
} from '../redux/selectors.es'
import { setTitleLang, setFollowGame, clearManualDone } from '../redux/reducer.es'
import { ItemCounts } from './QuestProgress.es'
import {
  updateData,
  getLastUpdated,
  getAutoUpdate,
  setAutoUpdate,
  getOverridePath,
} from '../lib/data-update.es'

const Wrapper = styled.div`
  padding: 10px;
  font-size: 13.5px;
`

const Row = styled.div`
  margin: 7px 0;
  font-size: 13px;
`

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 6px;
  flex-wrap: wrap;
`

const Small = styled.div`
  font-size: 12px;
  opacity: 0.6;
  line-height: 1.7;
`

const fmt = (ts) => {
  if (!ts) return '从未更新'
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const Settings = () => {
  const [tick, setTick] = useState(0)
  // tick 变化时重新读取，以便更新后立即反映
  const db = useMemo(() => getDb(), [tick])
  const meta = db.meta ?? {}
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [auto, setAuto] = useState(() => getAutoUpdate())
  const dispatch = useDispatch()
  const lang = useSelector(titleLangSelector)
  const followGame = useSelector(followGameSelector)
  const manual = useSelector(manualDoneSelector)
  const favorites = useSelector(favoritesSelector)

  const onUpdate = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await updateData()
      if (r.ok) {
        invalidateDb()
        setTick((t) => t + 1)
        setMsg({
          intent: Intent.SUCCESS,
          text: `更新完成：${r.updated} 条任务文本，来源 ${r.sources.join(' + ')}`,
        })
        try {
          window.success?.('任务数据已更新')
        } catch (e) {
          /* 非 poi 环境 */
        }
      } else {
        setMsg({ intent: Intent.WARNING, text: `更新失败：${r.error}` })
      }
    } catch (e) {
      setMsg({ intent: Intent.DANGER, text: `更新出错：${e.message}` })
    } finally {
      setBusy(false)
    }
  }, [])

  const onToggleAuto = useCallback((e) => {
    const v = e.target.checked
    setAuto(v)
    setAutoUpdate(v)
  }, [])

  return (
    <Wrapper>
      <Callout title="显示与行为" icon="settings" style={{ marginBottom: 12 }}>
        <Row>
          <b>任务标题语言</b>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Button
              small
              intent={lang === 'ja' ? Intent.PRIMARY : Intent.NONE}
              onClick={() => dispatch(setTitleLang('ja'))}
            >
              日文原名（与游戏一致）
            </Button>
            <Button
              small
              intent={lang === 'zh' ? Intent.PRIMARY : Intent.NONE}
              onClick={() => dispatch(setTitleLang('zh'))}
            >
              中文译名
            </Button>
          </div>
          <Small style={{ marginTop: 5 }}>
            另一种语言会作为副标题显示，搜索时两种都能匹配。
          </Small>
        </Row>

        <Row style={{ marginTop: 12 }}>
          <Switch
            checked={followGame}
            label="游戏内接取任务时，自动跳转到该任务"
            onChange={(e) => dispatch(setFollowGame(e.target.checked))}
            style={{ marginBottom: 0 }}
          />
        </Row>

        <Row style={{ marginTop: 10 }}>
          手动标记为已完成：<Tag minimal>{manual.size}</Tag> 个 ｜ 收藏目标：
          <Tag minimal>{favorites.length}</Tag> 个
          {manual.size > 0 && (
            <Button
              small
              minimal
              icon="trash"
              style={{ marginLeft: 8 }}
              onClick={() => dispatch(clearManualDone())}
            >
              清空手动标记
            </Button>
          )}
        </Row>
      </Callout>

      <Callout title="道具持有量" icon="cube" style={{ marginBottom: 12 }}>
        <ItemCounts />
      </Callout>

      <Callout title="数据源" icon="database">
        <Row>
          任务数 <Tag minimal>{meta.questCount}</Tag> ｜ 前置边{' '}
          <Tag minimal>{meta.edges}</Tag> ｜ 最长链 <Tag minimal>{meta.maxDepth}</Tag> 级
        </Row>
        <Row>打包数据源：{(meta.sources ?? []).join(' + ')}</Row>
        <Row>打包生成时间：{meta.generatedAt}</Row>

        <Bar>
          <Button
            icon="refresh"
            intent={Intent.PRIMARY}
            loading={busy}
            onClick={onUpdate}
          >
            立即更新数据
          </Button>
          <Switch
            checked={auto}
            label="自动更新（每天检查一次）"
            onChange={onToggleAuto}
            style={{ marginBottom: 0 }}
          />
        </Bar>

        <Row>
          上次在线更新：<Tag minimal>{fmt(getLastUpdated())}</Tag>
          {db.override?.applied > 0 && (
            <>
              {' '}
              ｜ 已应用 <Tag minimal intent={Intent.SUCCESS}>{db.override.applied}</Tag> 条
            </>
          )}
        </Row>

        {msg && (
          <Callout intent={msg.intent} style={{ marginTop: 8, padding: '6px 10px' }}>
            {msg.text}
          </Callout>
        )}

        <Small style={{ marginTop: 10 }}>
          在线更新只覆盖会随游戏变化的<b>文本层</b>（任务名 / 说明 / 达成条件），
          任务的前置关系、结构化奖励与编成要求来自随包冻结的数据，不受影响。
          <br />
          更新文件存放于插件数据目录，不会随插件升级丢失：
          <code style={{ fontSize: 11 }}>{getOverridePath()}</code>
        </Small>

        <Small style={{ marginTop: 8 }}>
          任务数据整理自舰C wiki 社区（kanxy 静态数据 / kcwikizh·kcQuests /
          antest1·kcanotify-gamedata）。开发时可运行 <code>npm run build-data</code> 重建打包数据。
        </Small>
      </Callout>
    </Wrapper>
  )
}

export default Settings
