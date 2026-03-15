import { ExternalLink, FileStack, QrCode, ScanSearch, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  formatDateTime,
  formatTencentDocsLoginStatus,
  getTencentDocsLoginDescription,
  getTencentDocsLoginTone
} from '../../lib/ui'
import { InlineNotice } from '../ui/InlineNotice'
import { StageSectionCard } from '../ui/StageSectionCard'
import { StatusBadge } from '../ui/StatusBadge'

export function HandoffControlCenter({
  syncConfig,
  docsConfigDraft,
  onDraftChange,
  onSaveConfig,
  onInspect,
  docsDiagnostic,
  diagnosticPending,
  docsLoginSession,
  onStartLogin,
  diagnosticsOpen,
  onToggleDiagnostics,
  mobileExpanded = false,
  onToggleMobile = () => {}
}) {
  const tabs = docsDiagnostic.payload?.tabs || []
  const loginStatus = docsLoginSession?.status || syncConfig.login?.status || 'IDLE'
  const qrImageUrl = docsLoginSession?.qrImageUrl || syncConfig.login?.qrImageUrl || ''
  const showLoginQr = Boolean(qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(loginStatus))
  const draftDocUrl = String(docsConfigDraft.docUrl || '').trim()
  const resolvedSheetName = String(docsConfigDraft.sheetName || syncConfig.target?.sheetName || '').trim()
  const savedDocUrl = String(syncConfig.target?.docUrl || '').trim()
  const savedSheetName = String(syncConfig.target?.sheetName || '').trim()
  const needsSave = draftDocUrl !== savedDocUrl || (resolvedSheetName && resolvedSheetName !== savedSheetName)
  const targetReady = Boolean(draftDocUrl && resolvedSheetName && !needsSave)
  const headerTone = docsDiagnostic.error
    ? 'danger'
    : diagnosticPending
      ? 'info'
      : (loginStatus === 'LOGGED_IN' ? 'success' : 'warning')
  const setupHeadline = getSetupHeadline({
    draftDocUrl,
    resolvedSheetName,
    loginStatus,
    diagnosticPending,
    docsDiagnostic
  })
  const primaryAction = getPrimaryAction({
    draftDocUrl,
    resolvedSheetName,
    needsSave,
    loginStatus,
    onSaveConfig,
    onStartLogin,
    onInspect
  })
  const setupProgress = getSetupProgress({
    draftDocUrl,
    resolvedSheetName,
    loginStatus,
    diagnosticPending,
    docsDiagnostic
  })
  const mobileSummary = {
    status: setupProgress.status,
    statusTone: setupProgress.statusTone,
    value: resolvedSheetName ? `工作表 ${resolvedSheetName}` : '等待目标确认',
    detail: primaryAction.label,
    description: `当前状态：${setupHeadline.title}。下一步：${primaryAction.label}。`
  }

  return (
    <StageSectionCard
      id="batch-setup-stage"
      className="batch-stage-card batch-setup-stage stack-lg"
      eyebrow="阶段 1 / 4"
      title="交接表准备"
      description="先锁定文档目标，再确认登录态，最后重新检查工作表。"
      variant="feature"
      mobileSummary={mobileSummary}
      mobileExpanded={mobileExpanded}
      onToggleMobile={onToggleMobile}
    >
      <div className={`setup-stage-banner tone-${headerTone}`}>
        <div>
          <strong>{setupHeadline.title}</strong>
          <small>{setupHeadline.detail}</small>
        </div>
        <StatusBadge tone={getTencentDocsLoginTone(loginStatus)} emphasis="soft">
          {formatTencentDocsLoginStatus(loginStatus)}
        </StatusBadge>
      </div>

      <div className="setup-stage-layout">
        <section className="setup-stage-panel stack-md">
          <label className="field">
            <span>腾讯文档链接</span>
            <input
              type="url"
              placeholder="https://docs.qq.com/sheet/..."
              value={docsConfigDraft.docUrl}
              onChange={(event) => onDraftChange({ docUrl: event.target.value })}
            />
          </label>

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

          {readTencentDocsTabToken(draftDocUrl) ? (
            <InlineNotice
              tone="info"
              eyebrow="链接提示"
              icon={FileStack}
              title="链接已带工作表定位参数"
              description="保存或检查后会优先识别当前工作表，不会按异常提示处理。"
            />
          ) : null}

          <div className="setup-stage-actions">
            <button
              className="primary-btn"
              type="button"
              disabled={!draftDocUrl || primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
            </button>

            <div className="setup-stage-secondary-actions">
              {draftDocUrl ? (
                <a className="secondary-btn inline-link-btn" href={draftDocUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} aria-hidden="true" />
                  <span>查看原链接</span>
                </a>
              ) : null}
              <button className="secondary-btn ghost-btn" type="button" onClick={onToggleDiagnostics}>
                <TriangleAlert size={16} aria-hidden="true" />
                <span>{diagnosticsOpen ? '收起排障' : '打开排障'}</span>
              </button>
            </div>
          </div>
        </section>

        <section className="setup-stage-status-panel stack-md">
          <div className="setup-status-grid">
            <SetupSummaryCard
              label="文档目标"
              value={summarizeTencentDocUrl(draftDocUrl || savedDocUrl)}
              detail={draftDocUrl || savedDocUrl ? '目标文档已录入' : '请先输入文档链接'}
              tone={draftDocUrl || savedDocUrl ? 'info' : 'warning'}
            />
            <SetupSummaryCard
              label="工作表"
              value={resolvedSheetName || '未选择'}
              detail={resolvedSheetName ? '当前回填目标' : '需先检查后确认'}
              tone={resolvedSheetName ? 'info' : 'warning'}
            />
            <SetupSummaryCard
              label="腾讯文档"
              value={formatTencentDocsLoginStatus(loginStatus)}
              detail={getTencentDocsLoginDescription(loginStatus)}
              tone={getTencentDocsLoginTone(loginStatus)}
            />
            <SetupSummaryCard
              label="最近检查"
              value={docsDiagnostic.checkedAt ? formatDateTime(docsDiagnostic.checkedAt) : '未检查'}
              detail={diagnosticPending ? '后台预检查中' : (docsDiagnostic.error ? '上次检查失败' : '可随时重新检查')}
              tone={docsDiagnostic.error ? 'danger' : (docsDiagnostic.checkedAt ? 'success' : 'neutral')}
            />
          </div>

          {showLoginQr ? (
            <div className="setup-qr-card">
              <div className="setup-qr-copy">
                <strong>登录二维码已就绪</strong>
                <small>扫码并在手机确认后，平台会自动更新为可读表状态。</small>
              </div>
              <img className="qr-image" src={qrImageUrl} alt="腾讯文档登录二维码" />
            </div>
          ) : (
            <div className={`setup-inline-status tone-${targetReady ? 'success' : 'warning'}`}>
              <ShieldCheck size={18} aria-hidden="true" />
              <div>
                <strong>{targetReady ? '目标已锁定，可继续操作' : '请先完成目标设置'}</strong>
                <small>
                  {targetReady
                    ? '下一步建议根据当前登录态选择“登录腾讯文档”或“重新检查工作表”。'
                    : '链接、工作表和已保存配置需先收敛到同一目标。'}
                </small>
              </div>
            </div>
          )}
        </section>
      </div>

      {docsDiagnostic.error ? (
        <InlineNotice
          tone="danger"
          eyebrow="检查失败"
          icon={TriangleAlert}
          title={docsDiagnostic.error.message || '最近一次工作表检查失败'}
          description="建议先处理登录态或目标工作表，再重新检查。"
        />
      ) : null}
    </StageSectionCard>
  )
}

function SetupSummaryCard({ label, value, detail, tone }) {
  return (
    <div className={`setup-summary-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function getPrimaryAction({ draftDocUrl, resolvedSheetName, needsSave, loginStatus, onSaveConfig, onStartLogin, onInspect }) {
  if (!draftDocUrl || !resolvedSheetName || needsSave) {
    return {
      label: '保存并检查工作表',
      onClick: onSaveConfig,
      icon: <ScanSearch size={18} aria-hidden="true" />,
      disabled: !draftDocUrl
    }
  }

  if (loginStatus !== 'LOGGED_IN') {
    return {
      label: '登录腾讯文档',
      onClick: onStartLogin,
      icon: <QrCode size={18} aria-hidden="true" />,
      disabled: false
    }
  }

  return {
    label: '重新检查工作表',
    onClick: onInspect,
    icon: <ScanSearch size={18} aria-hidden="true" />,
    disabled: false
  }
}

function summarizeTencentDocUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    const path = url.pathname.replace(/^\/+/, '')
    return path || url.hostname
  } catch (_error) {
    return value ? '链接待检查' : '未设置'
  }
}

function readTencentDocsTabToken(value) {
  try {
    const url = new URL(String(value || '').trim())
    return String(url.searchParams.get('tab') || '').trim()
  } catch (_error) {
    return ''
  }
}

function getSetupHeadline({ draftDocUrl, resolvedSheetName, loginStatus, diagnosticPending, docsDiagnostic }) {
  if (!draftDocUrl) {
    return {
      title: '先输入腾讯文档链接',
      detail: '准备区只做一件事：把文档目标锁定下来。'
    }
  }

  if (!resolvedSheetName) {
    return {
      title: '先确认目标工作表',
      detail: '工作表未确定时，不进入登录和发码阶段。'
    }
  }

  if (loginStatus !== 'LOGGED_IN') {
    return {
      title: '目标已确定，下一步登录腾讯文档',
      detail: '先建立可复用的编辑态，再开始检查工作表。'
    }
  }

  if (diagnosticPending) {
    return {
      title: '登录态已就绪，后台正在预检查工作表',
      detail: '你也可以直接手动触发重新检查。'
    }
  }

  if (docsDiagnostic.checkedAt) {
    return {
      title: '交接表已完成最近一次检查',
      detail: '现在可以继续确认需求、发起任务或抽查结果。'
    }
  }

  return {
    title: '登录态已就绪，建议立即检查工作表',
    detail: '只有检查完成后，需求摘要和任务发起区才会进入稳定状态。'
  }
}

function getSetupProgress({ draftDocUrl, resolvedSheetName, loginStatus, diagnosticPending, docsDiagnostic }) {
  if (!draftDocUrl || !resolvedSheetName) {
    return { status: '未准备', statusTone: 'warning' }
  }
  if (docsDiagnostic.error || loginStatus === 'FAILED') {
    return { status: '需处理', statusTone: 'danger' }
  }
  if (diagnosticPending || loginStatus === 'WAITING_QR' || loginStatus === 'WAITING_CONFIRM' || loginStatus === 'WAITING_SMS') {
    return { status: '进行中', statusTone: 'info' }
  }
  if (docsDiagnostic.checkedAt && loginStatus === 'LOGGED_IN') {
    return { status: '已完成', statusTone: 'success' }
  }
  return { status: '需处理', statusTone: 'warning' }
}
