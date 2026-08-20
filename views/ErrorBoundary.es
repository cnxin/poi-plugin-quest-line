/**
 * 错误边界：组件抛错时显示可读提示，而不是让整个 poi tab 白屏。
 *
 * 数据文件损坏、远端更新写入异常等情况都可能触发，
 * 给用户一条明确的自救路径（关闭再启用 / 重新下载数据）。
 */
import React from 'react'
import styled from 'styled-components'
import { Callout, Button, Intent } from '@blueprintjs/core'

const Wrap = styled.div`
  padding: 14px;
`

const Pre = styled.pre`
  font-size: 11px;
  opacity: 0.7;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  margin-top: 8px;
`

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 同时打到 poi 的日志，便于用户反馈时附带
    try {
      window.error?.(`任务线插件出错: ${error?.message ?? error}`)
    } catch (e) {
      /* 非 poi 环境 */
    }
    // eslint-disable-next-line no-console
    console.error('[poi-plugin-quest-line]', error, info?.componentStack)
  }

  handleReset = () => {
    // 清掉数据缓存后重试，覆盖「更新写入了坏数据」的场景
    try {
      // eslint-disable-next-line global-require
      require('../lib/quest-db.es').invalidateDb()
    } catch (e) {
      /* ignore */
    }
    this.setState({ error: null })
  }

  handleClearOverride = () => {
    try {
      // eslint-disable-next-line global-require
      const { getOverridePath } = require('../lib/data-update.es')
      // eslint-disable-next-line global-require
      const fs = require('fs')
      const p = getOverridePath()
      if (fs.existsSync(p)) fs.unlinkSync(p)
      // eslint-disable-next-line global-require
      require('../lib/quest-db.es').invalidateDb()
    } catch (e) {
      /* ignore */
    }
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <Wrap>
        <Callout intent={Intent.DANGER} icon="error" title="任务线插件出错">
          <div style={{ fontSize: 13, marginTop: 4 }}>
            可以先重试；若是在线更新后才出现，试试清除已下载的数据回到随包版本。
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button small icon="refresh" onClick={this.handleReset}>
              重试
            </Button>
            <Button small icon="trash" onClick={this.handleClearOverride}>
              清除已下载数据
            </Button>
          </div>
          <Pre>{String(error?.stack ?? error)}</Pre>
        </Callout>
      </Wrap>
    )
  }
}

export default ErrorBoundary
