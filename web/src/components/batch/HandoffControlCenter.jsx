import {
  formatDateTime,
  formatTencentDocsLoginStatus,
  getTencentDocsLoginDescription,
  getTencentDocsLoginTone
} from '../../lib/ui'
import { SectionCard } from '../ui/SectionCard'

export function HandoffControlCenter({
  syncConfig,
  docsConfigDraft,
  onDraftChange,
  onSaveConfig,
  onInspect,
  docsDiagnostic,
  docsLoginSession,
  onStartLogin
}) {
  const tabs = docsDiagnostic.payload?.tabs || []
  const loginStatus = docsLoginSession?.status || syncConfig.login?.status || 'IDLE'
  const qrImageUrl = docsLoginSession?.qrImageUrl || syncConfig.login?.qrImageUrl || ''
  const showLoginQr = Boolean(qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(loginStatus))
  const urlTabToken = readTencentDocsTabToken(docsConfigDraft.docUrl)

  return (
    <SectionCard className="batch-control-center stack-lg">
      <div className="panel-split-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">交接表控制区</span>
          <h2>腾讯交接表驱动工作台</h2>
          <p>先锁定交接表和腾讯文档登录态，再让缺数达人列表和二维码任务队列保持同一个节奏。</p>
        </div>
        <div className="task-sync-meta">
          <strong>{getHubHeadline(docsDiagnostic.payload?.summary, loginStatus, docsConfigDraft)}</strong>
          <small>{docsDiagnostic.checkedAt ? `最近检查：${formatDateTime(docsDiagnostic.checkedAt)}` : '尚未检查交接表'}</small>
        </div>
      </div>

      <div className="handoff-hub-grid batch-control-grid">
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
                <option key={tab.name} value={tab.name}>
                  {tab.name}{tab.selected ? '（当前）' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="task-actions-inline">
            <button className="primary-btn" type="button" onClick={onSaveConfig} disabled={!docsConfigDraft.docUrl}>
              保存交接表
            </button>
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
            <div className={`meta-card compact-meta-card diagnostic-card tone-${getTencentDocsLoginTone(loginStatus)}`}>
              <span>腾讯文档登录</span>
              <strong>{formatTencentDocsLoginStatus(loginStatus)}</strong>
              <small>
                {docsLoginSession?.updatedAt
                  ? formatDateTime(docsLoginSession.updatedAt)
                  : (syncConfig.login?.updatedAt ? formatDateTime(syncConfig.login.updatedAt) : '未登录')}
              </small>
            </div>
          </div>
          {docsDiagnostic.error ? <div className="inline-error">{docsDiagnostic.error.message}</div> : null}
        </section>

        <section className="panel handoff-login-panel stack-md">
          <div className="compact-panel-header">
            <h3>腾讯文档扫码登录</h3>
            <p>登录一次后会长期保存编辑态；读表或写表提示失效时，再重新生成二维码即可。</p>
          </div>
          <div className={`task-state-banner tone-${getTencentDocsLoginTone(loginStatus)}`}>
            <strong>{formatTencentDocsLoginStatus(loginStatus)}</strong>
            <small>{getTencentDocsLoginDescription(loginStatus)}</small>
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
                <strong>
                  {loginStatus === 'LOGGED_IN'
                    ? '已登录腾讯文档'
                    : (loginStatus === 'WAITING_QR' || loginStatus === 'WAITING_CONFIRM' ? '二维码恢复中' : '等待生成登录二维码')}
                </strong>
                <small>
                  {loginStatus === 'LOGGED_IN'
                    ? '现在可以检查工作表、识别缺数达人并执行自动回填。'
                    : ((loginStatus === 'WAITING_QR' || loginStatus === 'WAITING_CONFIRM')
                        ? '当前已有登录会话在等待扫码，若图片未出现可再点一次上方按钮恢复。'
                        : '先保存腾讯文档链接，再点击上方按钮生成登录二维码。')}
                </small>
              </div>
            )}
          </div>
        </section>
      </div>
    </SectionCard>
  )
}

function readTencentDocsTabToken(value) {
  try {
    const url = new URL(String(value || '').trim())
    return String(url.searchParams.get('tab') || '').trim()
  } catch (_error) {
    return ''
  }
}

function getHubHeadline(summary = {}, loginStatus, docsConfigDraft) {
  const needsFillRows = Number(summary?.needsFillRows || 0)
  if (!docsConfigDraft.docUrl) return '先配置腾讯文档链接，再开始交接表闭环。'
  if (loginStatus !== 'LOGGED_IN') return '腾讯文档未完成登录，建议先补登录态再发码。'
  if (needsFillRows > 0) return `当前有 ${needsFillRows} 位达人待补数，可以准备发码。`
  return '交接表已完成本轮检查，可以继续抽查任务结果或重新读表。'
}
