/**
 * 我的目标：收藏多条任务线，随时查看各自进展。
 *
 * 达成路径是实时算的，一次只能看一个目标；玩家通常同时盯着好几条线
 * （比如一边推装备开发线一边刷改造素材），收藏后可以横向对比进度。
 */
import React, { useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import styled from 'styled-components'
import { Tag, Button, Callout, ProgressBar, Intent, Icon } from '@blueprintjs/core'
import { getDb } from '../lib/quest-db.es'
import { computeQuestPath } from '../lib/quest-path.es'
import { primaryName, secondaryName } from '../lib/quest-name.es'
import {
  completedIdsSelector,
  favoritesSelector,
  titleLangSelector,
  STATUS,
} from '../redux/selectors.es'
import { toggleFavorite } from '../redux/reducer.es'

const Root = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 10px 12px;
`

const Card = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 3px solid ${(p) => p.$accent};
  border-radius: 3px;
  padding: 9px 12px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.03);
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
`

const Name = styled.span`
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`

const Sub = styled.div`
  font-size: 12px;
  opacity: 0.5;
  margin-top: 2px;
`

const Stat = styled.div`
  font-size: 12.5px;
  opacity: 0.8;
  margin: 7px 0 5px;
`

const NextUp = styled.div`
  font-size: 12.5px;
  margin-top: 7px;
  opacity: 0.9;
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  opacity: 0.45;
  font-size: 13.5px;
  text-align: center;
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

export const Favorites = ({ onSelect, onOpenPath }) => {
  const db = useMemo(() => getDb(), [])
  const dispatch = useDispatch()
  const favorites = useSelector(favoritesSelector)
  const completed = useSelector(completedIdsSelector)
  const lang = useSelector(titleLangSelector)

  const items = useMemo(
    () =>
      favorites
        .map((id) => {
          const q = db.quests[id]
          if (!q) return null
          return { id, quest: q, path: computeQuestPath(id, completed) }
        })
        .filter(Boolean)
        // 快完成的排前面，便于优先收尾
        .sort((a, b) => {
          if (a.path.alreadyDone !== b.path.alreadyDone) return a.path.alreadyDone ? 1 : -1
          return a.path.total - b.path.total
        }),
    [favorites, completed, db],
  )

  if (!items.length) {
    return (
      <Root>
        <Empty>
          <Icon icon="star-empty" size={30} />
          <div>
            还没有收藏任何目标
            <br />
            在任务详情或达成路径里点 ☆ 即可收藏，之后可在这里统一查看进度
          </div>
        </Empty>
      </Root>
    )
  }

  return (
    <Root>
      {items.map(({ id, quest, path }) => {
        const pct = path.totalInChain ? path.doneCount / path.totalInChain : 0
        const nextWave = path.waves[0] ?? []
        return (
          <Card key={id} $accent={CAT_COLOR[quest.category] ?? '#666'}>
            <Head>
              <Button
                minimal
                small
                icon="star"
                title="取消收藏"
                onClick={() => dispatch(toggleFavorite(id))}
              />
              <Tag
                style={{
                  background: CAT_COLOR[quest.category] ?? '#666',
                  color: '#111',
                  fontWeight: 600,
                }}
              >
                {quest.wikiId || id}
              </Tag>
              <Name onClick={() => onSelect?.(id)}>{primaryName(quest, lang)}</Name>
              <Tag minimal>{quest.category}</Tag>
              {path.alreadyDone && (
                <Tag intent={Intent.SUCCESS} minimal>
                  已达成
                </Tag>
              )}
            </Head>
            {secondaryName(quest, lang) && <Sub>{secondaryName(quest, lang)}</Sub>}

            <Stat>
              {path.alreadyDone
                ? `整条链 ${path.totalInChain} 个任务已全部完成`
                : `还需 ${path.total} 个任务 · 分 ${path.waves.length} 步 · 已完成 ${path.doneCount}/${path.totalInChain}（${Math.round(pct * 100)}%）`}
            </Stat>
            <ProgressBar
              value={pct}
              intent={path.alreadyDone ? Intent.SUCCESS : Intent.PRIMARY}
              stripes={false}
              animate={false}
            />

            {!path.alreadyDone && nextWave.length > 0 && (
              <NextUp>
                <span style={{ color: '#ffb366' }}>接下来可以做：</span>
                <Chips>
                  {nextWave.slice(0, 6).map((nid) => {
                    const nq = db.quests[nid]
                    if (!nq) return null
                    return (
                      <Tag
                        key={nid}
                        minimal
                        interactive
                        intent={Intent.WARNING}
                        onClick={() => onSelect?.(nid)}
                        title={primaryName(nq, lang)}
                      >
                        {nq.wikiId || nid} {primaryName(nq, lang).slice(0, 14)}
                      </Tag>
                    )
                  })}
                  {nextWave.length > 6 && <Tag minimal>…等 {nextWave.length - 6} 个</Tag>}
                </Chips>
              </NextUp>
            )}

            <div style={{ marginTop: 8 }}>
              <Button small icon="route" onClick={() => onOpenPath?.(id)}>
                查看完整路径
              </Button>
            </div>
          </Card>
        )
      })}

      <Callout style={{ marginTop: 6, padding: '7px 10px', fontSize: 12 }}>
        共 {items.length} 个目标。进度随游戏数据与手动标记实时更新，按剩余任务数排序。
      </Callout>
    </Root>
  )
}

export default Favorites
