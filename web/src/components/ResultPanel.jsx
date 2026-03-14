import { useEffect, useId, useMemo, useState } from 'react'
import { CircleAlert, Copy, FileImage, LoaderCircle, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react'
import { formatDateTime, formatMetricValue, getErrorPresentation } from '../lib/ui'
import { resolveMetricPayload } from '../lib/taskFormat'
import { EmptyState } from './ui/EmptyState'
import { SectionCard } from './ui/SectionCard'
import { StatusBadge } from './ui/StatusBadge'

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

const PRIMARY_METRICS = METRIC_ORDER.slice(0, 5)
const SECONDARY_METRICS = METRIC_ORDER.slice(5)

export function ResultPanel({ result, error, loading, activeAccount, onRetryLogin }) {
  const [activeTab, setActiveTab] = useState('summary')
  const [copyState, setCopyState] = useState('idle')
  const screenshotTabsId = useId()
  const summaryTabId = `${screenshotTabsId}-summary-tab`
  const rawTabId = `${screenshotTabsId}-raw-tab`
  const panelId = `${screenshotTabsId}-panel`
  const screenshotTabs = [
    { value: 'summary', label: '作品分析截图', id: summaryTabId },
    { value: 'raw', label: '作品管理截图', id: rawTabId }
  ]

  useEffect(() => {
    setActiveTab('summary')
    setCopyState('idle')
  }, [result])

  const errorState = useMemo(() => getErrorPresentation(error), [error])
  const previewImageUrl = activeTab === 'summary' ? result?.screenshots?.summaryUrl : result?.screenshots?.rawUrl

  const handleScreenshotTabsKeyDown = (event) => {
    const currentIndex = screenshotTabs.findIndex((item) => item.value === activeTab)
    if (currentIndex === -1) return

    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % screenshotTabs.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + screenshotTabs.length) % screenshotTabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = screenshotTabs.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextTab = screenshotTabs[nextIndex]
    const tabList = event.currentTarget
    setActiveTab(nextTab.value)
    window.requestAnimationFrame(() => {
      tabList
        ?.querySelector(`[data-tab="${nextTab.value}"]`)
        ?.focus()
    })
  }

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
    <SectionCard className="result-panel stack-lg" variant="feature">
      <div className="panel-header compact-panel-header result-panel-title-block">
        <div className="result-panel-kicker">
          <TrendingUp size={18} aria-hidden="true" />
          <span className="section-eyebrow">结果舞台</span>
        </div>
        <div>
          <h2>验证结果舞台</h2>
          <p>把主 KPI、证据截图和补充信息拆成清晰层级，优先让你先看结论，再看细节。</p>
        </div>
      </div>

      {loading && !result ? <LoadingState /> : null}

      {loading && result ? (
        <div className="result-refresh-banner" role="status" aria-live="polite">
          <LoaderCircle size={16} aria-hidden="true" className="spinning-icon" />
          <span>正在刷新当前结果，已有数据暂时保留在页面上。</span>
        </div>
      ) : null}

      {!loading && errorState && result ? (
        <div className={`result-refresh-banner tone-${errorState.tone}`} role={errorState.tone === 'danger' ? 'alert' : 'status'} aria-live="polite">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{errorState.description}</span>
        </div>
      ) : null}

      {!loading && errorState && !result ? (
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
              <button className="primary-btn" type="button" onClick={onRetryLogin}>
                <ShieldAlert size={18} aria-hidden="true" />
                <span>重新扫码登录</span>
              </button>
            ) : null}
            {error?.details?.screenshots?.rawUrl ? (
              <a className="secondary-btn inline-link-btn" href={error.details.screenshots.rawUrl} target="_blank" rel="noreferrer">
                <FileImage size={18} aria-hidden="true" />
                <span>打开原图</span>
              </a>
            ) : null}
          </div>
          {error?.details?.screenshots?.rawUrl ? (
            <img className="result-image" src={error.details.screenshots.rawUrl} alt="错误态原始截图" />
          ) : null}
        </div>
      ) : null}

      {!loading && !errorState && !result ? (
        <EmptyState
          eyebrow="等待查询"
          tone={activeAccount ? 'info' : 'neutral'}
          icon={activeAccount ? Sparkles : ShieldAlert}
          title={activeAccount ? '输入内容 ID 后即可开始查询' : '请先选择或新增账号'}
          description={
            activeAccount
              ? `当前账号为 ${activeAccount.nickname}，查询完成后这里会优先展示 5 个主 KPI、次要指标和两张截图。`
              : '左侧选择一个账号后，再输入内容 ID 发起查询。'
          }
        />
      ) : null}

      {result ? (
        <>
          <div className="result-stage-header">
            <div className="result-stage-title">
              <StatusBadge tone="success" emphasis="solid">
                查询成功
              </StatusBadge>
              <div className="result-stage-title-copy">
                <strong>{result.nickname}</strong>
                <small>内容 ID：{result.contentId}</small>
              </div>
            </div>
            <div className="result-state-bar success-bar" role="status" aria-live="polite">
              <div>
                <span className="result-state-label">状态</span>
                <strong>查询成功</strong>
              </div>
              <small>{formatDateTime(result.fetchedAt)}</small>
            </div>
          </div>

          <div className="metrics-grid">
            {PRIMARY_METRICS.map((metric) => {
              const payload = resolveMetricPayload(result.metrics, metric)
              return (
                <div key={metric} className="metric-card emphasized-metric-card result-hero-metric">
                  <span>{metric}</span>
                  <strong>{formatMetricValue(payload?.value)}</strong>
                  <small>{payload?.field || '-'}</small>
                </div>
              )
            })}
          </div>

          <div className="image-panel evidence-panel">
            <div className="image-panel-header">
              <div className="image-panel-header-copy">
                <span className="section-eyebrow">证据视图</span>
                <h3>截图舞台</h3>
                <small>{activeTab === 'summary' ? '对应“作品分析”页面 30 日汇总数据。' : '对应“内容管理 > 作品管理”页面的单条卡片数据。'}</small>
              </div>
              <div className="tabs-switcher" role="tablist" aria-label="截图切换" onKeyDown={handleScreenshotTabsKeyDown}>
                {screenshotTabs.map((tab) => (
                  <button
                    key={tab.value}
                    className={`tab-btn ${activeTab === tab.value ? 'active' : ''}`}
                    type="button"
                    id={tab.id}
                    data-tab={tab.value}
                    role="tab"
                    aria-controls={panelId}
                    aria-selected={activeTab === tab.value}
                    tabIndex={activeTab === tab.value ? 0 : -1}
                    onClick={() => setActiveTab(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="image-stage"
              role="tabpanel"
              id={panelId}
              aria-labelledby={activeTab === 'summary' ? summaryTabId : rawTabId}
            >
              {previewImageUrl ? (
                <img
                  className="result-image large-preview"
                  src={previewImageUrl}
                  alt={activeTab === 'summary' ? '汇总截图预览' : '原始截图预览'}
                />
              ) : (
                <div className="result-empty-state compact-empty-state">
                  <CircleAlert size={18} aria-hidden="true" />
                  <strong>暂无可展示截图</strong>
                </div>
              )}
            </div>
          </div>

          <div className="result-actions-row">
            <button className="secondary-btn" type="button" onClick={handleCopy}>
              <Copy size={18} aria-hidden="true" />
              <span>{copyState === 'done' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制全部数据'}</span>
            </button>
            {result.screenshots?.rawUrl ? (
              <a className="secondary-btn inline-link-btn" href={result.screenshots.rawUrl} target="_blank" rel="noreferrer">
                <FileImage size={18} aria-hidden="true" />
                <span>打开原图</span>
              </a>
            ) : null}
          </div>

          <details className="result-supporting-details">
            <summary>查看次要指标与元信息</summary>
            <div className="result-stage-subgrid">
              <section className="secondary-metrics-section stack-md" aria-label="次要指标">
                <div className="compact-panel-header">
                  <h3>次要指标</h3>
                  <p>补充展示互动类指标，保持主 KPI 读数区的聚焦感。</p>
                </div>
                <div className="secondary-metrics-grid">
                  {SECONDARY_METRICS.map((metric) => {
                    const payload = resolveMetricPayload(result.metrics, metric)
                    return (
                      <div key={metric} className="metric-card secondary-metric-card">
                        <span>{metric}</span>
                        <strong>{formatMetricValue(payload?.value)}</strong>
                        <small>{payload?.field || '-'}</small>
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="result-meta-grid expanded-meta-grid">
                <div className="meta-card"><span>账号昵称</span><strong>{result.nickname}</strong></div>
                <div className="meta-card"><span>账号 ID</span><strong>{result.accountId}</strong></div>
                <div className="meta-card"><span>内容 ID</span><strong>{result.contentId}</strong></div>
                <div className="meta-card"><span>查询时间</span><strong>{formatDateTime(result.fetchedAt)}</strong></div>
              </div>
            </div>
          </details>
        </>
      ) : null}
    </SectionCard>
  )
}

function LoadingState() {
  return (
    <div className="stack-lg result-loading-shell">
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
      <div className="result-loading-copy">
        <LoaderCircle size={16} aria-hidden="true" className="spinning-icon" />
        <span>正在拉取 30 日指标并生成证据截图…</span>
      </div>
    </div>
  )
}
