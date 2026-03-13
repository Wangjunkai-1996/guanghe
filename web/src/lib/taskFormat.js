export const METRIC_ORDER = [
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

const METRIC_ALIASES = {
    查看次数: '内容查看次数',
    查看人数: '内容查看人数',
    种草成交金额: '种草成交金额',
    种草成交人数: '种草成交人数',
    商品点击次数: '商品点击次数',
    小眼睛数: 'viewCount',
    点赞数: 'likeCount',
    收藏数: 'collectCount',
    评论数: 'commentCount'
}

export function resolveMetricPayload(metrics, label) {
    if (!metrics) return null
    if (metrics[label]) return metrics[label]
    const alias = METRIC_ALIASES[label]
    if (alias && metrics[alias]) return metrics[alias]
    const reversed = Object.keys(METRIC_ALIASES).find((key) => METRIC_ALIASES[key] === label)
    if (reversed && metrics[reversed]) return metrics[reversed]
    return null
}

export const TENCENT_DOCS_REQUIRED_HEADERS = [
    '内容id',
    '查看次数截图',
    '查看次数',
    '查看人数',
    '种草成交金额',
    '种草成交人数',
    '商品点击次数',
    '前端小眼睛截图',
    '小眼睛数',
    '点赞数',
    '收藏数',
    '评论数'
]

export function getMissingTencentDocsHeaders(headers) {
    if (!headers || headers.length === 0) return TENCENT_DOCS_REQUIRED_HEADERS
    return TENCENT_DOCS_REQUIRED_HEADERS.filter(required => !headers.includes(required))
}

export function formatDateTime(dateString) {
    if (!dateString) return '-'
    try {
        const d = new Date(dateString)
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch (_e) {
        return String(dateString)
    }
}

export function formatMetricValue(value) {
    if (value === null || value === undefined) return '-'
    return String(value)
}

export function supportsClipboardImage() {
    return typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof window.ClipboardItem !== 'undefined'
}

export function stopPropagation(e) {
    e.stopPropagation()
}

export function isTaskBusy(task) {
    return ['QUEUED', 'RUNNING'].includes(task.query.status) || task.sync?.status === 'RUNNING'
}

export function canRefreshTaskLogin(task) {
    return ['WAITING_QR', 'WAITING_CONFIRM', 'EXPIRED', 'FAILED'].includes(task.login.status) &&
        !['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(task.query.status) &&
        task.login.status !== 'WAITING_SMS'
}

export function canRetryTaskQuery(task) {
    return ['NO_DATA', 'FAILED'].includes(task.query.status) || task.login.status === 'LOGGED_IN'
}

export function canDeleteTask(task) {
    return !['QUEUED', 'RUNNING'].includes(task.query.status) && task.sync?.status !== 'RUNNING'
}

export function canPreviewTaskSync(task, syncConfig) {
    const hasTarget = task?.taskMode === 'SHEET_DEMAND'
        ? Boolean(task?.sheetTarget?.docUrl && task?.sheetTarget?.sheetName)
        : Boolean(syncConfig?.defaultTargetConfigured)
    return task?.query?.status === 'SUCCEEDED' && Boolean(task?.artifacts?.resultUrl) && Boolean(syncConfig?.enabled) && hasTarget && task?.sync?.status !== 'RUNNING'
}

export function canSyncTask(task, syncConfig) {
    return canPreviewTaskSync(task, syncConfig)
}

export function resolveTaskSyncState(task, syncConfig) {
    if (!syncConfig.available || !syncConfig.defaultTargetConfigured) return 'UNAVAILABLE'
    if (task.query.status !== 'SUCCEEDED') return 'PENDING'
    return task.sync?.status || 'IDLE'
}

export function getTaskSyncDescription(task, syncConfig) {
    if (!syncConfig.available) return '系统未接入或未开启腾讯文档同步。'
    if (!syncConfig.defaultTargetConfigured) return '请先配置默认目标工作表。'
    if (task.query.status !== 'SUCCEEDED') return '请先完成数据查询。'
    if (task.sync?.status === 'SUCCEEDED') return '已成功将数据回填至腾讯文档。'
    if (task.sync?.status === 'RUNNING') return '正在执行数据回填...'
    if (task.sync?.status === 'FAILED') return task.sync.error?.message || '回填失败，请检查诊断信息。'
    return '查询已完成，可点击右侧进行预览或手动触发回填。'
}

export function getTencentDocsLoginStatus(syncConfig, diagnostic) {
    if (!syncConfig.available) return { tone: 'neutral', value: '不可用', detail: syncConfig.error || '未配置' }
    if (syncConfig.loading) return { tone: 'info', value: '检查中', detail: '正在读取环境配置...' }
    if (diagnostic.loading) return { tone: 'info', value: '检查中', detail: '正在调用诊断接口...' }
    if (!diagnostic.checkedAt) return { tone: 'neutral', value: '尚未诊断', detail: '建议立即诊断确认环境' }

    if (diagnostic.error) {
        if (diagnostic.error.code === 'GUEST_MODE_NOT_SUPPORTED') return { tone: 'danger', value: '可能未登录', detail: '未能读取到表头（请检查是否只有游客权限）' }
        if (diagnostic.error.code === 'PLAYWRIGHT_TIMEOUT') return { tone: 'warning', value: '响应超时', detail: '页面加载或渲染偏慢' }
        return { tone: 'danger', value: '检查异常', detail: diagnostic.error.message }
    }
    return { tone: 'success', value: '状态正常', detail: '可以正常访问并读取数据' }
}

export function getTencentDocsSheetStatus(syncConfig, diagnostic, missingHeaders) {
    if (!syncConfig.available || !syncConfig.defaultTargetConfigured) return { tone: 'neutral', value: '-', detail: '前置条件未满足' }
    if (diagnostic.loading) return { tone: 'info', value: '检查中', detail: '正在读取表头...' }
    if (!diagnostic.checkedAt || diagnostic.error) return { tone: 'neutral', value: '未知', detail: '等待前置检查通过' }

    const headers = diagnostic.payload?.headers || []
    if (headers.length === 0) return { tone: 'danger', value: '读取失败', detail: '未能找到第一行的有效列名' }
    if (missingHeaders.length > 0) return { tone: 'warning', value: '列名缺失', detail: `缺少 ${missingHeaders.length} 个标准列，可能导致对应指标回填失败` }
    return { tone: 'success', value: '完全匹配', detail: '所需的回填列已全部找到' }
}

export function getTaskSummary(task) {
    if (task.taskMode === 'SHEET_DEMAND') {
        if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return '该行已回填，无需重复操作。'
        if (task.sheetMatch?.status === 'NOT_IN_SHEET') return '未在第一波查询记录中找到该达人。'
        if (task.sheetMatch?.status === 'DUPLICATE_NICKNAME') return '该达人存在多行记录，请先在交接表中手动处理重复行。'
        if (task.sheetMatch?.status === 'DUPLICATE_ACCOUNT_ID') return '该逛逛 ID 对应多行记录，请先在交接表中手动处理重复行。'
        if (task.sheetMatch?.status === 'CONTENT_ID_MISSING') return '该行缺少内容 ID，无法进行查询。'
        if (task.sheetMatch?.status === 'ROW_CHANGED') return '该行内容在云端已被其他人修改，已中止自动处理，请刷新后重试。'
    }

    if (task.sync?.status === 'FAILED') return '腾讯文档同步失败。'
    if (task.sync?.status === 'SUCCEEDED') return '腾讯文档同步成功。'
    if (task.sync?.status === 'RUNNING') return '正在同步至腾讯文档...'

    if (task.query?.status === 'FAILED') return '查询任务遇到系统错误。'
    if (task.query?.status === 'NO_DATA') return '该内容 ID 在当前账号下无数据。'
    if (task.query?.status === 'SUCCEEDED') return '数据查询成功，等待检查同步状态。'
    if (task.query?.status === 'RUNNING') return '正在云端查询数据...'
    if (task.query?.status === 'QUEUED') return '已进入队列，准备查询。'

    if (task.login?.status === 'WAITING_QR' || task.login?.status === 'WAITING_CONFIRM') return '请用对应达人账号扫码或在手机确认授权。'
    if (task.login?.status === 'WAITING_SMS') return '触发风控验证，请输入手机短信验证码。'
    if (task.login?.status === 'EXPIRED') return '二维码已过期。'
    if (task.login?.status === 'FAILED') return '登录流程异常中断。'
    if (task.login?.status === 'LOGGED_IN') {
        if (task.sheetMatch?.status === 'NEEDS_FILL') return '达人已登录，等待自动查询。'
        return '已登录成功，等待触发查询。'
    }

    return '任务已就绪'
}

export function getTaskSheetMatchSource(task) {
    const matchedBy = task?.sheetMatch?.details?.matchedBy || []
    if (matchedBy.includes('逛逛ID')) return '按逛逛ID命中'
    if (matchedBy.includes('nickname')) return '按昵称命中'
    return ''
}

export function getTaskSheetMatchDetail(task) {
    if (!task || task.taskMode !== 'SHEET_DEMAND') return ''
    const m = task.sheetMatch
    if (!m) return '未开始匹配'

    const matchSource = getTaskSheetMatchSource(task)
    const sourceSuffix = matchSource ? `（${matchSource}）` : ''

    switch (m.status) {
        case 'NOT_IN_SHEET': return `在「第一波查询」工作表中未找到达人：${task.accountNickname || '待确认'}${sourceSuffix}`
        case 'DUPLICATE_NICKNAME': return `找到多行同名达人：${task.accountNickname || '待确认'}${sourceSuffix}`
        case 'DUPLICATE_ACCOUNT_ID': return `找到多行相同逛逛ID：${task.accountId || '待确认'}${sourceSuffix}`
        case 'CONTENT_ID_MISSING': return `目标行缺少内容 ID${sourceSuffix}`
        case 'ALREADY_COMPLETE': return `所有指标已存在数据，无需重复查询${sourceSuffix}`
        case 'ROW_CHANGED': return `该行云端数据已变更，触发防冲突保护${sourceSuffix}`
        case 'NEEDS_FILL': return m.missingColumns && m.missingColumns.length > 0
            ? `预计可回填记录，但当前模板缺少：${m.missingColumns.join('、')}${sourceSuffix}`
            : `命中成功，将自动查询并回填${sourceSuffix}`
        default:
            return m.status || '状态未知'
    }
}

export function formatTaskLoginStatus(status) {
    switch (status) {
        case 'WAITING_QR': return '获取二维码'
        case 'WAITING_CONFIRM': return '等待手机确认'
        case 'WAITING_SMS': return '输入短信验证码'
        case 'LOGGED_IN': return '已登录'
        case 'EXPIRED': return '二维码过期'
        case 'FAILED': return '登录失败'
        case 'INTERRUPTED': return '已中止'
        default: return status || '未知'
    }
}

export function formatTaskQueryStatus(status) {
    switch (status) {
        case 'IDLE': return '尚未开始'
        case 'QUEUED': return '排队中'
        case 'RUNNING': return '处理中'
        case 'SUCCEEDED': return '成功'
        case 'FAILED': return '失败'
        case 'NO_DATA': return '无数据'
        default: return status || '未知'
    }
}

export function formatTaskSyncStatus(task, syncConfig) {
    if (!syncConfig.available || !syncConfig.defaultTargetConfigured) return '-'
    if (task.query.status !== 'SUCCEEDED') return '等待查询'
    const status = task.sync?.status || 'IDLE'
    switch (status) {
        case 'IDLE': return '尚未开始'
        case 'RUNNING': return '同步中'
        case 'SUCCEEDED': return '成功'
        case 'FAILED': return '失败'
        default: return status
    }
}

export function getTaskPrimaryActionLabel(task) {
    if (task.sync?.status === 'FAILED') return '查看原因'
    if (task.query?.status === 'SUCCEEDED' && task.sync?.status === 'IDLE') return '待同步'
    if (task.query?.status === 'SUCCEEDED') return '查看截图'
    if (['NO_DATA', 'FAILED'].includes(task.query?.status)) return '重试查询'
    if (['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login?.status)) return '立即扫码'
    if (task.login?.status === 'WAITING_SMS') return '输入验证码'
    if (['EXPIRED', 'FAILED', 'INTERRUPTED'].includes(task.login?.status)) return '刷新二维码'
    if (task.taskMode === 'SHEET_DEMAND' && ['NOT_IN_SHEET', 'DUPLICATE_NICKNAME', 'DUPLICATE_ACCOUNT_ID', 'CONTENT_ID_MISSING', 'ROW_CHANGED'].includes(task.sheetMatch?.status)) return '手动干预'
    return '查看详情'
}

export function normalizeStatusTone(tone) {
    return tone === 'neutral' ? 'info' : tone
}

export function getTaskRecommendations(task, syncConfig) {
    const recommendations = []

    if (task.taskMode === 'SHEET_DEMAND' && task.sheetMatch?.status) {
        if (task.sheetMatch.status === 'NOT_IN_SHEET') return ['核对腾讯文档内达名人称是否一致', '是否粘贴了其他工作表的达人']
        if (task.sheetMatch.status === 'DUPLICATE_NICKNAME') return ['在腾讯文档中搜索该达人，标记或删除多余重复行', '处理完毕后可在平台上直接点击重连扫码']
        if (task.sheetMatch.status === 'DUPLICATE_ACCOUNT_ID') return ['在腾讯文档中搜索该逛逛ID，标记或删除多余重复行', '处理完毕后可在平台上直接点击重连扫码']
        if (task.sheetMatch.status === 'CONTENT_ID_MISSING') return ['在腾讯文档对应行上补齐"内容id"列信息']
        if (task.sheetMatch.status === 'ROW_CHANGED') return ['有人刚在腾讯文档修改了这行数据，请刷新任务状态重试']
        if (task.sheetMatch.status === 'ALREADY_COMPLETE') return []
    }

    if (task.sync?.status === 'FAILED') {
        recommendations.push('请查阅错误截图或诊断面板定位原因', '核准无误后使用“重试同步”')
    }

    if (task.sync?.status === 'IDLE' && task.query?.status === 'SUCCEEDED' && syncConfig.available && syncConfig.defaultTargetConfigured) {
        recommendations.push('可点击下方“预览回填”预测效果', '确认无警告后点击“立即同步”')
    }

    if (task.query?.status === 'NO_DATA') {
        recommendations.push('请核对“账号”和“内容ID”是否确实属于该达人')
    }

    if (task.query?.status === 'FAILED') {
        recommendations.push('很可能是界面变动导致超时，可重试几次。如持续失败，请查看并上报网络日志。')
    }

    return recommendations
}

export function getTaskLoginTone(status) {
    if (status === 'LOGGED_IN') return 'success'
    if (status === 'WAITING_QR' || status === 'WAITING_CONFIRM') return 'info'
    if (status === 'EXPIRED') return 'warning'
    return 'danger'
}

export function getTaskQueryTone(status) {
    if (status === 'SUCCEEDED') return 'success'
    if (status === 'RUNNING' || status === 'QUEUED') return 'info'
    if (status === 'NO_DATA' || status === 'FAILED') return 'danger'
    return 'neutral'
}

export function getTaskSyncTone(task, syncConfig) {
    const syncState = resolveTaskSyncState(task, syncConfig)
    if (syncState === 'SUCCEEDED') return 'success'
    if (syncState === 'RUNNING') return 'info'
    if (syncState === 'FAILED') return 'danger'
    if (syncState === 'PENDING') return 'neutral'
    return 'warning'
}

export function getTaskOverallTone(task) {
    if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return 'success'
    if (isExceptionalTask(task)) return 'danger'
    if (task.query?.status === 'SUCCEEDED') return 'success'
    if (isWaitingTask(task)) return 'info'
    return 'warning'
}

export function formatTaskSheetMatchStatus(status) {
    if (status === 'NEEDS_FILL') return '待补数'
    if (status === 'ALREADY_COMPLETE') return '数据已全'
    if (status === 'CONTENT_ID_MISSING') return '缺内容ID'
    if (status === 'DUPLICATE_NICKNAME') return '达人重名'
    if (status === 'DUPLICATE_ACCOUNT_ID') return '逛逛ID重复'
    if (status === 'NOT_IN_SHEET') return '表中无此达人'
    if (status === 'ROW_CHANGED') return '目标行已变更'
    return status || '待匹配'
}

export function getTaskSheetMatchTone(status) {
    if (status === 'ALREADY_COMPLETE') return 'success'
    if (status === 'NEEDS_FILL') return 'warning'
    if (['CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'DUPLICATE_ACCOUNT_ID', 'NOT_IN_SHEET', 'ROW_CHANGED'].includes(status)) return 'danger'
    return 'info'
}

export function createTencentDocsDiagnosticState(overrides = {}) {
    return {
        loading: false,
        inspected: false,
        payload: null,
        error: null,
        checkedAt: '',
        ...overrides
    }
}

export function getWorkspaceHeadline(tasks, filteredTasks) {
    if (tasks.length === 0) return '先在上方配置交接表并生成二维码任务，工作台会自动接管扫码、查询和回填跟进。'
    if (filteredTasks.length === 0) return '当前筛选下没有任务，切回全部即可继续处理。'

    const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
    const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
    const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length

    if (waitingCount > 0) return `当前有 ${waitingCount} 条待扫码任务，建议优先发码。`
    if (exceptionCount > 0) return `当前有 ${exceptionCount} 条异常任务，建议先处理交接表异常、查询异常或同步失败。`
    if (inProgressCount > 0) return `当前有 ${inProgressCount} 条任务正在推进，可继续观察自动查询和回填结果。`
    return '所有任务都已进入完成状态，可按需抽查结果、截图和腾讯文档写入日志。'
}

export function getFilterDescription(filterKey, filterOptions) {
    const current = filterOptions.find((option) => option.value === filterKey)
    if (!current) return '按优先级展示任务，点击任一任务即可进入右侧焦点区。'
    if (filterKey === 'all') return '按优先级展示任务，优先把注意力放在待扫码、交接表异常和同步失败项。'
    return `当前聚焦：${current.label}。点击任一任务即可集中处理。`
}

export function isWaitingTask(task) {
    return ['WAITING_QR', 'WAITING_CONFIRM', 'WAITING_SMS'].includes(task.login?.status)
}

export function isInProgressTask(task) {
    if (task.sheetMatch?.status === 'NEEDS_FILL' && task.query?.status === 'IDLE') return true
    return ['QUEUED', 'RUNNING'].includes(task.query?.status) || task.sync?.status === 'RUNNING' || (task.login?.status === 'LOGGED_IN' && task.query?.status === 'IDLE' && !isTaskSheetTerminal(task))
}

export function isFinishedTask(task) {
    if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return true
    return task.query?.status === 'SUCCEEDED' && task.sync?.status !== 'FAILED'
}

export function isExceptionalTask(task) {
    return ['NO_DATA', 'FAILED'].includes(task.query?.status)
        || ['EXPIRED', 'FAILED', 'INTERRUPTED'].includes(task.login?.status)
        || task.sync?.status === 'FAILED'
        || ['NOT_IN_SHEET', 'CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'DUPLICATE_ACCOUNT_ID', 'ROW_CHANGED'].includes(task.sheetMatch?.status)
}

function isTaskSheetTerminal(task) {
    return ['ALREADY_COMPLETE', 'NOT_IN_SHEET', 'CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'DUPLICATE_ACCOUNT_ID', 'ROW_CHANGED'].includes(task.sheetMatch?.status)
}

export function getTaskPriority(task) {
    if (isExceptionalTask(task)) return 1
    if (isWaitingTask(task)) return 2
    if (isInProgressTask(task)) return 3
    return 4
}

export function countNonEmptyLines(input) {
    return String(input || '')
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .length
}

export function matchesFilter(task, filterKey) {
    if (filterKey === 'waiting') return isWaitingTask(task)
    if (filterKey === 'in-progress') return isInProgressTask(task)
    if (filterKey === 'exception') return isExceptionalTask(task)
    if (filterKey === 'finished') return isFinishedTask(task)
    return true
}
