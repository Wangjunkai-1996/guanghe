const path = require('path')

const LOGIN_URL = 'https://creator.guanghe.taobao.com/page?layout=%2Fvelocity%2Flayout%2Findex.vm'
const WORK_ANALYSIS_URL = 'https://creator.guanghe.taobao.com/page/unify/work-analysis'
// 作品管理/工作台入口（新路径）
const CONTENT_MANAGE_URL = 'https://creator.guanghe.taobao.com/page/workspace/tb'
const DEFAULT_METRICS = [
  '内容查看次数',
  '内容查看人数',
  '种草成交金额',
  '种草成交人数',
  '商品点击次数'
]
const METRIC_FIELD_MAP = {
  '内容查看次数': 'consumePv',
  '内容查看人数': 'consumeUv',
  '种草成交金额': 'payAmtZcLast',
  '种草成交人数': 'payBuyerCntZc',
  '商品点击次数': 'ipvPv'
}
const DATE_CANDIDATES = ['30日', '近30日', '近30天', '最近30日', '最近30天']
const CONTENT_DATA_CANDIDATES = ['内容数据', '数据分析', '内容分析']
const WORK_ANALYSIS_CANDIDATES = ['作品分析', '作品数据分析', '单条作品数据分析', '我的作品']
const CONTENT_MANAGE_CANDIDATES = ['内容管理', '作品管理']
const WORKS_MANAGE_CANDIDATES = ['作品管理', '我的视频', '视频列表']
const METRIC_TRIGGER_CANDIDATES = ['收起更多指标', '其他指标', '指标选择', '更多指标', '自定义指标', '指标']
const QUERY_BUTTON_CANDIDATES = ['查询', '搜索', '确定', '筛选']
const OVERLAY_CLOSE_CANDIDATES = ['我知道了', '下一步', '跳过', '知道了', '关闭', '暂不', '以后再说']
const LOGIN_SESSION_STATUS = {
  WAITING_QR: 'WAITING_QR',
  WAITING_CONFIRM: 'WAITING_CONFIRM',
  WAITING_SMS: 'WAITING_SMS',
  LOGGED_IN: 'LOGGED_IN',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED'
}

function getAppPaths(rootDir = process.cwd()) {
  return {
    rootDir,
    dataDir: path.resolve(rootDir, 'data'),
    accountsFile: path.resolve(rootDir, 'data', 'accounts.json'),
    tasksFile: path.resolve(rootDir, 'data', 'tasks.json'),
    profileRootDir: path.resolve(rootDir, '.cache', 'profiles'),
    artifactsRootDir: path.resolve(rootDir, 'artifacts', 'web'),
    distDir: path.resolve(rootDir, 'dist')
  }
}

module.exports = {
  LOGIN_URL,
  WORK_ANALYSIS_URL,
  CONTENT_MANAGE_URL,
  DEFAULT_METRICS,
  METRIC_FIELD_MAP,
  DATE_CANDIDATES,
  CONTENT_DATA_CANDIDATES,
  WORK_ANALYSIS_CANDIDATES,
  CONTENT_MANAGE_CANDIDATES,
  WORKS_MANAGE_CANDIDATES,
  METRIC_TRIGGER_CANDIDATES,
  QUERY_BUTTON_CANDIDATES,
  OVERLAY_CLOSE_CANDIDATES,
  LOGIN_SESSION_STATUS,
  getAppPaths
}
