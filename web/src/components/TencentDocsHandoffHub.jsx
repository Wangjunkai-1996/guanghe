import { formatDateTime } from '../lib/ui'

const SHEET_FILTER_OPTIONS = [
  { value: 'open', label: '仅看待补数' },
  { value: 'exception', label: '仅看异常' },
  { value: 'all', label: '查看全部' },
  { value: 'complete', label: '已完整' }
]

export function TencentDocsHandoffHub({
  syncConfig,
  docsConfigDraft,
  onDraftChange,
  onSaveConfig,
  onInspect,
  docsDiagnostic,
  docsLoginSession,
  onStartLogin,
  onCreateSheetTasks,
  creatingSheetTasks,
  demandFilter,
  onDemandFilterChange,
  demandSearch,
  onDemandSearchChange
}) {
  const tabs = docsDiagnostic.payload?.tabs || []
  const demands = docsDiagnostic.payload?.demands || []
  const summary = docsDiagnostic.payload?.summary || {
    totalRows: 0,
    completeRows: 0,
    needsFillRows: 0,
    missingContentIdRows: 0,
    duplicateNicknameRows: 0
  }
  const filteredDemands = demands
    .filter((item) => matchesDemandFilter(item, demandFilter))
    .filter((item) => {
      const keyword = String(demandSearch || '').trim().toLowerCase()
      if (!keyword) return true
      return [item.nickname, item.contentId, item.status].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  const loginStatus = docsLoginSession?.status || syncConfig.login?.status || 'IDLE'
  const qrImageUrl = docsLoginSession?.qrImageUrl || syncConfig.login?.qrImageUrl || ''
  const showLoginQr = Boolean(qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(loginStatus))
  const canCreateSheetTasks = Boolean(syncConfig.enabled && docsConfigDraft.docUrl && docsConfigDraft.sheetName && loginStatus === 'LOGGED_IN')
  const urlTabToken = readTencentDocsTabToken(docsConfigDraft.docUrl)

  return (
    <section className="panel handoff-hub-panel stack-lg">
      <div className="panel-split-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">交接表闭环</span>
          <h2>腾讯交接表驱动工作台</h2>
          <p>先锁定交接表和腾讯文档登录态，再看缺数达人，最后批量发光合二维码给达人扫码。</p>
        </div>
        <div className="task-sync-meta">
          <strong>{getHubHeadline(summary, loginStatus, docsConfigDraft)}</strong>
          <small>{docsDiagnostic.checkedAt ? `最近检查：${formatDateTime(docsDiagnostic.checkedAt)}` : '尚未检查交接表'}</small>
        </div>
      </div>

      <div className="handoff-hub-grid">
        <section className="panel handoff-config-panel stack-md">
          <div className="compact-panel-header">
            <h3>交接表配置</h3>
            <p>输入腾讯文档链接，检查工作表后手动选定交接表，配置会保存在本地。</p>
          </div>
          <label className="field">
            <span>腾讯文档链接</span>
            <input
              type="url"
              placeholder="https://docs.qq.com/sheet/..."
              value={docsConfigDraft.docUrl}
              onChange={(event) => onDraftChange({ docUrl: event.target.value })}
            />
          </label>
          {urlTabToken ? (
            <div className="task-inline-hint">
              已检测到链接里包含工作表定位参数，保存或检查后会自动识别当前工作表。
            </div>
          ) : null}
          <label className="field">
            <span>目标工作表</span>
            <select value={docsConfigDraft.sheetName} onChange={(event) => onDraftChange({ sheetName: event.target.value })}>
              <option value="">请选择工作表</option>
              {tabs.map((tab) => (
                <option key={tab.name} value={tab.name}>{tab.name}{tab.selected ? '（当前）' : ''}</option>
              ))}
            </select>
          </label>
          <div className="task-actions-inline">
            <button className="primary-btn" type="button" onClick={onSaveConfig} disabled={!docsConfigDraft.docUrl}>保存交接表</button>
            <button className="secondary-btn" type="button" onClick={onInspect} disabled={!docsConfigDraft.docUrl || docsDiagnostic.loading}>
              {docsDiagnostic.loading ? '检查中...' : '检查工作表'}
            </button>
          </div>
          <div className="task-summary-grid diagnostic-summary-grid">
            <div className="meta-card compact-meta-card diagnostic-card tone-info">
              <span>当前目标</span>
              <strong>{docsConfigDraft.sheetName || syncConfig.target?.sheetName || '未选择'}</strong>
              <small>{docsConfigDraft.docUrl || syncConfig.target?.docUrl || '请先录入腾讯文档链接'}</small>
            </div>
            <div className={`meta-card compact-meta-card diagnostic-card tone-${getLoginTone(loginStatus)}`}>
              <span>腾讯文档登录</span>
              <strong>{formatLoginStatus(loginStatus)}</strong>
              <small>{docsLoginSession?.updatedAt ? formatDateTime(docsLoginSession.updatedAt) : (syncConfig.login?.updatedAt ? formatDateTime(syncConfig.login.updatedAt) : '未登录')}</small>
            </div>
          </div>
          {docsDiagnostic.error ? <div className="inline-error">{docsDiagnostic.error.message}</div> : null}
        </section>

        <section className="panel handoff-login-panel stack-md">
          <div className="compact-panel-header">
            <h3>腾讯文档扫码登录</h3>
            <p>登录一次后会长期保存编辑态；读表或写表提示失效时，再重新生成二维码即可。</p>
          </div>
          <div className={`task-state-banner tone-${getLoginTone(loginStatus)}`}>
            <strong>{formatLoginStatus(loginStatus)}</strong>
            <small>{getLoginDescription(loginStatus)}</small>
          </div>
          <div className="task-actions-inline">
            <button className="primary-btn" type="button" onClick={onStartLogin} disabled={!docsConfigDraft.docUrl}>
              {showLoginQr ? '重新生成腾讯文档二维码' : '腾讯文档扫码登录'}
            </button>
          </div>
          <div className="qr-wrap handoff-login-qr-wrap">
            {showLoginQr ? (
              <img className="qr-image" src={qrImageUrl} alt="腾讯文档登录二维码" />
            ) : (
              <div className="task-qr-placeholder">
                <strong>{loginStatus === 'LOGGED_IN' ? '已登录腾讯文档' : (loginStatus === 'WAITING_QR' || loginStatus === 'WAITING_CONFIRM' ? '二维码恢复中' : '等待生成登录二维码')}</strong>
                <small>{loginStatus === 'LOGGED_IN' ? '现在可以检查工作表、识别缺数达人并执行自动回填。' : ((loginStatus === 'WAITING_QR' || loginStatus === 'WAITING_CONFIRM') ? '当前已有登录会话在等待扫码，若图片未出现可再点一次上方按钮恢复。' : '先保存腾讯文档链接，再点击上方按钮生成登录二维码。')}</small>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="task-summary-grid handoff-summary-grid">
        <SummaryCard label="总行数" value={summary.totalRows} helper="已扫描交接表数据行" tone="info" />
        <SummaryCard label="待补数" value={summary.needsFillRows} helper="可自动查数并回填" tone="warning" />
        <SummaryCard label="缺内容ID" value={summary.missingContentIdRows} helper="需先补内容 ID" tone="danger" />
        <SummaryCard label="重名异常" value={summary.duplicateNicknameRows} helper="同名达人需人工处理" tone="danger" />
        <SummaryCard label="已完整" value={summary.completeRows} helper="无需重复发码" tone="success" />
      </div>

      <section className="panel handoff-demand-panel stack-md">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <h3>缺数达人列表</h3>
            <p>默认只看需要补数和异常达人，发码前先确认内容 ID 和目标行是否正确。</p>
          </div>
          <div className="tasks-toolbar-actions">
            <button className="secondary-btn" type="button" onClick={() => onCreateSheetTasks(1)} disabled={!canCreateSheetTasks || creatingSheetTasks === 1}>生成 1 个光合二维码</button>
            <button className="secondary-btn" type="button" onClick={() => onCreateSheetTasks(2)} disabled={!canCreateSheetTasks || creatingSheetTasks === 2}>生成 2 个光合二维码</button>
            <button className="secondary-btn" type="button" onClick={() => onCreateSheetTasks(5)} disabled={!canCreateSheetTasks || creatingSheetTasks === 5}>生成 5 个光合二维码</button>
          </div>
        </div>

        <div className="handoff-demand-toolbar">
          <div className="task-actions-inline">
            {SHEET_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`secondary-btn compact-btn ${demandFilter === option.value ? 'is-active' : ''}`}
                type="button"
                onClick={() => onDemandFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="toolbar-search-field compact-search-field">
            <span>搜索达人</span>
            <input type="search" value={demandSearch} placeholder="搜索达人名、内容ID、状态" onChange={(event) => onDemandSearchChange(event.target.value)} />
          </label>
        </div>

        {filteredDemands.length === 0 ? (
          <div className="result-empty-state compact-empty-state">
            <strong>当前筛选下没有达人需求</strong>
            <p>可以切换到“查看全部”确认交接表扫描结果，或先检查表头和内容 ID 是否齐全。</p>
          </div>
        ) : (
          <div className="handoff-demand-list" role="table" aria-label="缺数达人列表">
            <div className="handoff-demand-row handoff-demand-head" role="row">
              <span>达人名</span>
              <span>内容 ID</span>
              <span>状态</span>
              <span>缺失列</span>
              <span>最近检查</span>
            </div>
            {filteredDemands.map((item) => (
              <div key={`${item.sheetRow}-${item.nickname}-${item.contentId}`} className="handoff-demand-row" role="row">
                <strong>{item.nickname || '未填写达人名'}</strong>
                <span className="mono-cell">{item.contentId || '-'}</span>
                <span className={`status-pill status-${getDemandTone(item.status)}`}>{formatDemandStatus(item.status)}</span>
                <span>{item.missingCount > 0 ? `${item.missingCount} 列` : '0 列'}</span>
                <small>{docsDiagnostic.checkedAt ? formatDateTime(docsDiagnostic.checkedAt) : '-'}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function SummaryCard({ label, value, helper, tone }) {
  return (
    <div className={`meta-card compact-meta-card diagnostic-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  )
}

function matchesDemandFilter(item, filter) {
  if (filter === 'exception') return ['CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME'].includes(item.status)
  if (filter === 'complete') return item.status === 'COMPLETE'
  if (filter === 'all') return true
  return item.status === 'NEEDS_FILL'
}

function getDemandTone(status) {
  if (status === 'COMPLETE') return 'success'
  if (status === 'NEEDS_FILL') return 'warning'
  return 'danger'
}

function formatDemandStatus(status) {
  if (status === 'COMPLETE') return '已完整'
  if (status === 'NEEDS_FILL') return '待补数'
  if (status === 'CONTENT_ID_MISSING') return '缺内容ID'
  if (status === 'DUPLICATE_NICKNAME') return '重名异常'
  return status || '未知'
}


function readTencentDocsTabToken(value) {
  try {
    const url = new URL(String(value || '').trim())
    return String(url.searchParams.get('tab') || '').trim()
  } catch (_error) {
    return ''
  }
}

function formatLoginStatus(status) {
  if (status === 'WAITING_QR') return '等待扫码'
  if (status === 'WAITING_CONFIRM') return '等待确认'
  if (status === 'LOGGED_IN') return '已登录'
  if (status === 'EXPIRED') return '二维码已过期'
  if (status === 'FAILED') return '登录失败'
  return '未登录'
}

function getLoginTone(status) {
  if (status === 'LOGGED_IN') return 'success'
  if (status === 'WAITING_QR' || status === 'WAITING_CONFIRM') return 'info'
  if (status === 'EXPIRED') return 'warning'
  return 'danger'
}

function getLoginDescription(status) {
  if (status === 'WAITING_QR') return '请用你的微信扫码登录腾讯文档。'
  if (status === 'WAITING_CONFIRM') return '已扫码，请在手机上确认登录。'
  if (status === 'LOGGED_IN') return '腾讯文档登录态已保存，可直接执行读表和回填。'
  if (status === 'EXPIRED') return '二维码已过期，重新生成后再扫码即可。'
  if (status === 'FAILED') return '腾讯文档登录失败，建议重新生成二维码。'
  return '还没有可用的腾讯文档登录态。'
}

function getHubHeadline(summary, loginStatus, draft) {
  if (!draft.docUrl) return '先录入腾讯文档链接并选定工作表。'
  if (loginStatus !== 'LOGGED_IN') return '先完成腾讯文档登录，再检查交接表和生成光合二维码。'
  if (summary.needsFillRows > 0) return `当前有 ${summary.needsFillRows} 位达人待补数，可以准备发码。`
  if (summary.missingContentIdRows > 0 || summary.duplicateNicknameRows > 0) return '交接表里还有异常行，建议先补内容 ID 或处理重名。'
  if (summary.totalRows > 0) return '交接表已检查完毕，可以按需生成光合二维码。'
  return '先检查交接表，再决定是否需要发码。'
}
