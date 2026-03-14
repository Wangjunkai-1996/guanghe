import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CircleAlert, ClipboardList, SendHorizontal, X } from 'lucide-react'

export function TaskBuilderModal({
  draftLines,
  draftValidation,
  displayBatchErrors,
  batchInput,
  submitting,
  textareaRef,
  serverBatchErrors,
  onClose,
  onChange,
  onSubmit
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence>
      <motion.div
        className="builder-modal-root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-builder-title"
        initial={shouldReduceMotion ? undefined : { opacity: 0 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0 }}
      >
        <div className="builder-modal-backdrop" onClick={onClose} />

        <motion.section
          className="panel builder-modal-panel stack-md"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20, scale: 0.98 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0.2, 1] }}
        >
        <div className="task-detail-header">
          <div className="compact-panel-header">
            <div className="v2-panel-badge">
              <ClipboardList size={18} aria-hidden="true" />
              <span>批量导入</span>
            </div>
            <h2 id="batch-builder-title">新建批量任务</h2>
            <p>先看可创建数量和错误，再一次性发出二维码任务，避免一边粘贴一边来回切页面。</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭新建任务">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="task-builder-stats">
          <div className="task-builder-stat">
            <span>总行数</span>
            <strong>{draftLines}</strong>
          </div>
          <div className="task-builder-stat">
            <span>可创建</span>
            <strong>{draftValidation.tasks.length}</strong>
          </div>
          <div className="task-builder-stat danger">
            <span>错误数</span>
            <strong>{displayBatchErrors.length}</strong>
          </div>
        </div>

        <form className="stack-md" onSubmit={onSubmit}>
          <label className="field">
            <span>批量任务输入</span>
            <textarea
              ref={textareaRef}
              className="batch-textarea"
              placeholder={'达人A,554608495125\n达人B\t537029503554'}
              value={batchInput}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>

          <div className="builder-helper-list">
            <span>格式 1：备注,内容ID</span>
            <span>格式 2：备注&lt;TAB&gt;内容ID</span>
            <span>建议一次控制在 1–5 条</span>
          </div>

          {displayBatchErrors.length > 0 ? (
            <div className="inline-error stack-sm">
              {displayBatchErrors.map((item, index) => (
                <div key={`${item.line}-${index}`}>
                  <CircleAlert size={16} aria-hidden="true" />
                  {item.line > 0 ? `第 ${item.line} 行：` : ''}
                  {item.message}
                </div>
              ))}
            </div>
          ) : null}

          {serverBatchErrors && serverBatchErrors.length > 0 ? (
            <div className="inline-error stack-sm">
              {serverBatchErrors.map((err, index) => (
                <div key={index}>
                  <CircleAlert size={16} aria-hidden="true" />
                  {err.message || '未知服务器错误'}
                </div>
              ))}
            </div>
          ) : null}

          <div className="task-composer-actions">
            <button className="primary-btn" type="submit" disabled={submitting}>
              <SendHorizontal size={18} aria-hidden="true" />
              <span>{submitting ? '创建中...' : '批量创建二维码任务'}</span>
            </button>
            <small>创建后系统会自动进入扫码跟进流程。</small>
          </div>
        </form>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  )
}
