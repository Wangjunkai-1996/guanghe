import { useId } from 'react'
import { formatDateTime } from '../../lib/ui'
import { SectionCard } from '../ui/SectionCard'
import { TencentDocsDiagnosticPanel } from '../TencentDocsDiagnosticPanel'

export function DiagnosticsPanel({ open, syncConfig, diagnostic, onInspect, onToggle }) {
  const panelId = useId()
  const headline = diagnostic.error
    ? diagnostic.error.message
    : diagnostic.checkedAt
      ? '最近一次排障信息已就绪，需要时再展开细看。'
      : '高级排障默认折叠，只有排查读表/表头/同步问题时再展开。'

  const detail = diagnostic.checkedAt
    ? `最近检查：${formatDateTime(diagnostic.checkedAt)}`
    : (diagnostic.loading ? '正在执行诊断…' : '当前未执行诊断')

  return (
    <section className="batch-diagnostics-shell stack-md">
      <SectionCard className="batch-diagnostics-summary">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">高级排障</span>
            <h2>腾讯文档高级排障</h2>
            <p>默认折叠，避免诊断信息持续抢占首屏注意力；只有处理读表、表头或回填异常时再展开。</p>
          </div>
          <div className="tasks-toolbar-actions">
            <button className="secondary-btn" type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
              {open ? '收起排障信息' : '展开排障信息'}
            </button>
          </div>
        </div>
        <div className={`task-state-banner tone-${diagnostic.error ? 'danger' : (diagnostic.loading ? 'info' : 'neutral')}`}>
          <strong>{headline}</strong>
          <small>{detail}</small>
        </div>
      </SectionCard>

      {open ? (
        <div id={panelId}>
          <TencentDocsDiagnosticPanel
            syncConfig={syncConfig}
            diagnostic={diagnostic}
            onInspect={onInspect}
          />
        </div>
      ) : null}
    </section>
  )
}
