const { createTencentDocsError, ERROR_CODES } = require('./errors')

const BASE_TEMPLATE_COLUMNS = [
  '同步键',
  '查询时间',
  '账号昵称',
  '账号ID',
  '内容ID',
  '内容查看次数',
  '内容查看人数',
  '种草成交金额',
  '种草成交人数',
  '商品点击次数'
]

const LINK_TEMPLATE_COLUMNS = ['原图链接', '汇总图链接', '结果JSON']
const HANDOFF_TEMPLATE_COLUMNS = [
  '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数',
  '前端小眼睛截图', '小眼睛数', '点赞数', '收藏数', '评论数'
]

function buildSyncKey({ accountId, contentId }) {
  return `${accountId}:${contentId}`
}

function buildTencentDocsRow(resultPayload, { toolBaseUrl = '', timezone = 'Asia/Shanghai' } = {}) {
  if (!resultPayload?.accountId || !resultPayload?.contentId) {
    throw createTencentDocsError(500, ERROR_CODES.WRITE_FAILED, '结果文件缺少账号或内容信息')
  }

  const syncKey = buildSyncKey(resultPayload)
  const row = {
    同步键: syncKey,
    查询时间: formatDateTime(resultPayload.fetchedAt, timezone),
    账号昵称: resultPayload.nickname || '-',
    账号ID: String(resultPayload.accountId),
    内容ID: String(resultPayload.contentId),
    内容查看次数: getMetricValue(resultPayload, '内容查看次数'),
    内容查看人数: getMetricValue(resultPayload, '内容查看人数'),
    种草成交金额: getMetricValue(resultPayload, '种草成交金额'),
    种草成交人数: getMetricValue(resultPayload, '种草成交人数'),
    商品点击次数: getMetricValue(resultPayload, '商品点击次数')
  }

  const warnings = []
  const omittedColumns = []
  const normalizedBaseUrl = String(toolBaseUrl || '').trim()
  if (normalizedBaseUrl) {
    row.原图链接 = buildAbsoluteUrl(normalizedBaseUrl, resultPayload?.screenshots?.rawUrl)
    row.汇总图链接 = buildAbsoluteUrl(normalizedBaseUrl, resultPayload?.screenshots?.summaryUrl)
    row.结果JSON = buildAbsoluteUrl(normalizedBaseUrl, resultPayload?.artifacts?.resultUrl)

    for (const column of LINK_TEMPLATE_COLUMNS) {
      if (!row[column]) warnings.push(`${column} 缺少可写入地址`)
    }
  } else {
    omittedColumns.push(...LINK_TEMPLATE_COLUMNS)
  }

  return {
    syncKey,
    row,
    columns: Object.keys(row),
    omittedColumns,
    warnings
  }
}

function buildTencentDocsHandoffPatch(resultPayload, { toolBaseUrl = '' } = {}) {
  if (!resultPayload?.contentId) {
    throw createTencentDocsError(500, ERROR_CODES.WRITE_FAILED, '结果文件缺少内容 ID，无法匹配交接表行')
  }

  const row = {
    查看次数截图: '',
    查看次数: getMetricValue(resultPayload, '内容查看次数'),
    查看人数: getMetricValue(resultPayload, '内容查看人数'),
    种草成交金额: getMetricValue(resultPayload, '种草成交金额'),
    种草成交人数: getMetricValue(resultPayload, '种草成交人数'),
    商品点击次数: getMetricValue(resultPayload, '商品点击次数'),
    前端小眼睛截图: '',
    小眼睛数: String(resultPayload?.metrics?.viewCount || '-'),
    点赞数: String(resultPayload?.metrics?.likeCount || '-'),
    收藏数: String(resultPayload?.metrics?.collectCount || '-'),
    评论数: String(resultPayload?.metrics?.commentCount || '-')
  }

  const warnings = []
  const normalizedBaseUrl = String(toolBaseUrl || '').trim()
  if (normalizedBaseUrl) {
    row.查看次数截图 = buildAbsoluteUrl(normalizedBaseUrl, resultPayload?.screenshots?.summaryUrl || resultPayload?.screenshots?.rawUrl)
    row.前端小眼睛截图 = buildAbsoluteUrl(normalizedBaseUrl, resultPayload?.screenshots?.cardUrl)
    if (!row.查看次数截图) {
      warnings.push('查看次数截图 缺少可写入地址')
    }
    if (!row.前端小眼睛截图) {
      warnings.push('前端小眼睛截图 缺少可写入地址')
    }
  } else {
    warnings.push('TOOL_BASE_URL 未配置，截图链接将保持为空')
  }


  return {
    matchValue: String(resultPayload.contentId),
    matchBy: ['内容id'],
    row,
    columns: HANDOFF_TEMPLATE_COLUMNS,
    warnings
  }
}

function getMetricValue(resultPayload, metricName) {
  const value = resultPayload?.metrics?.[metricName]?.value
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

function formatDateTime(value, timezone) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)

  const values = {}
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value
  }

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}

function buildAbsoluteUrl(baseUrl, relativeUrl) {
  if (!relativeUrl) return ''
  try {
    return new URL(String(relativeUrl).replace(/^\//, ''), ensureTrailingSlash(baseUrl)).toString()
  } catch (_error) {
    return ''
  }
}

function ensureTrailingSlash(value) {
  return String(value).endsWith('/') ? String(value) : `${value}/`
}

module.exports = {
  BASE_TEMPLATE_COLUMNS,
  LINK_TEMPLATE_COLUMNS,
  HANDOFF_TEMPLATE_COLUMNS,
  buildSyncKey,
  buildTencentDocsRow,
  buildTencentDocsHandoffPatch
}
