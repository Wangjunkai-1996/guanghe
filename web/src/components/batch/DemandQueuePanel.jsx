import { Search } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { StatusBadge } from '../ui/StatusBadge'

const FILTER_OPTIONS = [
  { value: 'open', label: '待补数' },
  { value: 'exception', label: '异常项' },
  { value: 'all', label: '全部' },
  { value: 'complete', label: '已完整' }
]

export function DemandQueuePanel({
  filteredDemands,
  demandFilter,
  demandSearch,
  onDemandFilterChange,
  onDemandSearchChange,
  selectedDemandRow,
  onSelectDemand,
  readyMatchCount,
  onFocusTasks
}) {
  return (
    <section className="panel demand-queue-panel stack-md">
      <div className="queue-panel-header">
        <h2>需求队列</h2>
        <StatusBadge tone={readyMatchCount > 0 ? 'success' : 'info'} emphasis="soft">
          READY 命中 {readyMatchCount}
        </StatusBadge>
      </div>

      <div className="task-board-toolbar demand-toolbar">
        <div className="task-filter-group" role="toolbar" aria-label="需求状态筛选">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`task-filter-chip tone-info ${demandFilter === option.value ? 'active' : ''}`}
              type="button"
              onClick={() => onDemandFilterChange(option.value)}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <div className="task-board-toolbar-right">
          <label className="toolbar-search-field">
            <span>搜索需求</span>
            <input
              type="search"
              value={demandSearch}
              placeholder="搜索达人、内容 ID、状态"
              onChange={(event) => onDemandSearchChange(event.target.value)}
            />
          </label>

          <button className="secondary-btn" type="button" onClick={onFocusTasks}>
            回到任务队列
          </button>
        </div>
      </div>

      {filteredDemands.length === 0 ? (
        <EmptyState
          eyebrow="需求队列"
          tone="warning"
          icon={Search}
          title="当前筛选下没有需求"
          description="切回“待补数”或“全部”后继续处理。"
        />
      ) : (
        <div className="demand-list" role="list" aria-label="交接表需求列表">
          {filteredDemands.map((item) => {
            const selected = selectedDemandRow === Number(item.sheetRow || 0)
            const tone = getDemandTone(item.status)

            return (
              <button
                key={`${item.sheetRow}-${item.nickname}`}
                className={`demand-row tone-${tone} ${selected ? 'selected' : ''}`}
                type="button"
                role="listitem"
                onClick={() => onSelectDemand(Number(item.sheetRow || 0))}
              >
                <div className="demand-row-main">
                  <div className="demand-row-copy">
                    <strong>{item.nickname || `第 ${item.sheetRow} 行`}</strong>
                    <small>第 {item.sheetRow || '-'} 行 · 内容 ID {item.contentId || '待补充'}</small>
                  </div>
                  <StatusBadge tone={tone} emphasis={selected ? 'solid' : 'soft'}>
                    {formatDemandStatus(item.status)}
                  </StatusBadge>
                </div>

                <div className="demand-row-meta">
                  <span>缺失：{formatMissingColumns(item)}</span>
                  <span>建议：{getDemandActionLabel(item.status)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
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

function formatMissingColumns(item) {
  if (!Array.isArray(item.missingColumns) || item.missingColumns.length === 0) return '已完整'
  if (item.missingColumns.length === 1) return item.missingColumns[0]
  return `${item.missingColumns[0]} 等 ${item.missingColumns.length} 列`
}

function getDemandActionLabel(status) {
  if (status === 'NEEDS_FILL') return '生成任务'
  if (status === 'CONTENT_ID_MISSING') return '补内容 ID'
  if (status === 'DUPLICATE_NICKNAME') return '人工排重'
  if (status === 'COMPLETE') return '抽查结果'
  return '继续处理'
}
