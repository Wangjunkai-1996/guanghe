import { useEffect, useMemo, useState } from 'react'
import { formatDateTime, formatMetricValue, getErrorPresentation } from '../lib/ui'
import { resolveMetricPayload } from '../lib/taskFormat'

const METRIC_ORDER = [
  '查看次数',
  '查看人数',
  '种草成交金额',
  '种草成交人数',
  '商品点击次数',
  '小眼睛数',
  '点赞数',
  '收藏数',
  '评论数'
]

export function ResultPanel({ result, error, loading, activeAccount, onRetryLogin }) {
  const [activeTab, setActiveTab] = useState('summary')
  const [copyState, setCopyState] = useState('idle')

  useEffect(() => {
    setActiveTab('summary')
    setCopyState('idle')
  }, [result])

  const errorState = useMemo(() => getErrorPresentation(error), [error])
  const previewImageUrl = activeTab === 'summary' ? result?.screenshots?.summaryUrl : result?.screenshots?.rawUrl

  const handleCopy = async () => {
    if (!result) return
    const content = [
      `账号昵称：${result.nickname}`,
      `账号 ID：${result.accountId}`,
      `内容 ID：${result.contentId}`,
      ...METRIC_ORDER.map((metric) => {
        const payload = resolveMetricPayload(result.metrics, metric)
        return `${metric}：${payload?.value ?? '-'}`
      })
    ].join('\n')

    try {
      await navigator.clipboard.writeText(content)
      setCopyState('done')
      window.setTimeout(() => setCopyState('idle'), 1500)
    } catch (_error) {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 1500)
    }
  }

  return (
    <section className="panel result-panel stack-lg">
      <div className="panel-header compact-panel-header">
        <div>
          <h2>结果区</h2>
          <p>优先展示当前最新查询结果，默认打开汇总截图以便快速读数。</p>
        </div>
      </div>

      {loading ? <LoadingState /> : null}

      {!loading && errorState ? (
        <div className={`result-state-card tone-${errorState.tone}`}>
          <div className="result-state-bar">
            <div>
              <span className="result-state-label">状态</span>
              <strong>{errorState.title}</strong>
            </div>
            <small>{error?.code || 'UNKNOWN_ERROR'}</small>
          </div>
          <p>{errorState.description}</p>
          <div className="result-state-actions">
            {errorState.action === 'retry-login' ? (
              <button className="primary-btn" type="button" onClick={onRetryLogin}>重新扫码登录</button>
            ) : null}
            {error?.details?.screenshots?.rawUrl ? (
              <a className="secondary-btn inline-link-btn" href={error.details.screenshots.rawUrl} target="_blank" rel="noreferrer">打开原图</a>
            ) : null}
          </div>
          {error?.details?.screenshots?.rawUrl ? (
            <img className="result-image" src={error.details.screenshots.rawUrl} alt="错误态原始截图" />
          ) : null}
        </div>
      ) : null}

      {!loading && !errorState && !result ? (
        <div className="result-empty-state">
          <strong>{activeAccount ? '输入内容 ID 后即可开始查询' : '请先选择或新增账号'}</strong>
          <p>
            {activeAccount
              ? `当前账号为 ${activeAccount.nickname}，查询完成后这里会展示 9 个核心指标和两张截图。`
              : '左侧选择一个账号后，再输入内容 ID 发起查询。'}
          </p>
        </div>
      ) : null}

      {!loading && result ? (
        <>
          <div className="result-state-bar success-bar">
            <div>
              <span className="result-state-label">状态</span>
              <strong>查询成功</strong>
            </div>
            <small>{formatDateTime(result.fetchedAt)}</small>
          </div>

          <div className="metrics-grid">
            {METRIC_ORDER.map((metric) => {
              const payload = resolveMetricPayload(result.metrics, metric)
              return (
                <div key={metric} className="metric-card emphasized-metric-card">
                  <span>{metric}</span>
                  <strong>{formatMetricValue(payload?.value)}</strong>
                  <small>{payload?.field || '-'}</small>
                </div>
              )
            })}
          </div>

          <div className="result-meta-grid expanded-meta-grid">
            <div className="meta-card"><span>账号昵称</span><strong>{result.nickname}</strong></div>
            <div className="meta-card"><span>账号 ID</span><strong>{result.accountId}</strong></div>
            <div className="meta-card"><span>内容 ID</span><strong>{result.contentId}</strong></div>
            <div className="meta-card"><span>查询时间</span><strong>{formatDateTime(result.fetchedAt)}</strong></div>
          </div>

          <div className="result-actions-row">
            <button className="secondary-btn" type="button" onClick={handleCopy}>
              {copyState === 'done' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制全部数据'}
            </button>
            <a className="secondary-btn inline-link-btn" href={result.screenshots?.rawUrl} target="_blank" rel="noreferrer">打开原图</a>
          </div>

          <div className="image-panel">
            <div className="image-panel-header">
              <div className="tabs-switcher" role="tablist" aria-label="截图切换">
                <button
                  className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveTab('summary')}
                >
                  作品分析截图
                </button>
                <button
                  className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveTab('raw')}
                >
                  作品管理截图
                </button>
              </div>
              <small>{activeTab === 'summary' ? '对应“作品分析”页面 30 日汇总数据。' : '对应“内容管理 > 作品管理”页面的单条卡片数据。'}</small>
            </div>

            <div className="image-stage">
              {previewImageUrl ? (
                <img
                  className="result-image large-preview"
                  src={previewImageUrl}
                  alt={activeTab === 'summary' ? '汇总截图预览' : '原始截图预览'}
                />
              ) : (
                <div className="result-empty-state compact-empty-state">
                  <strong>暂无可展示截图</strong>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function LoadingState() {
  return (
    <div className="stack-lg">
      <div className="result-state-bar loading-bar">
        <div>
          <span className="result-state-label">状态</span>
          <strong>查询中</strong>
        </div>
        <small>正在拉取数据并生成截图…</small>
      </div>
      <div className="metrics-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="metric-card skeleton-card">
            <div className="skeleton-line short" />
            <div className="skeleton-line tall" />
            <div className="skeleton-line medium" />
          </div>
        ))}
      </div>
      <div className="image-stage skeleton-stage">
        <div className="skeleton-line full" />
      </div>
    </div>
  )
}
