#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');

const LOGIN_URL = 'https://creator.guanghe.taobao.com/page?layout=%2Fvelocity%2Flayout%2Findex.vm';
const DEFAULT_METRICS = [
  '内容查看次数',
  '内容查看人数',
  '种草成交金额',
  '种草成交人数',
  '商品点击次数'
];
const DATE_CANDIDATES = ['30日', '近30日', '近30天', '最近30日', '最近30天'];
const CONTENT_DATA_CANDIDATES = ['内容数据', '数据分析', '内容分析'];
const WORK_ANALYSIS_CANDIDATES = ['作品分析', '作品数据分析', '单条作品数据分析', '我的作品'];
const METRIC_TRIGGER_CANDIDATES = ['其他指标', '指标选择', '更多指标', '自定义指标', '指标'];
const QUERY_BUTTON_CANDIDATES = ['查询', '搜索', '确定', '筛选'];
const OVERLAY_CLOSE_CANDIDATES = ['我知道了', '下一步', '跳过', '知道了', '关闭', '暂不', '以后再说'];
const METRIC_FIELD_MAP = {
  '内容查看次数': 'consumePv',
  '内容查看人数': 'consumeUv',
  '种草成交金额': 'payAmtZcLast',
  '种草成交人数': 'payBuyerCntZc',
  '商品点击次数': 'ipvPv'
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!args.contentId) {
    throw new Error('缺少 --content-id 参数，例如：--content-id 537029503554');
  }

  const timestamp = formatTimestamp(new Date());
  const rootDir = process.cwd();
  const artifactDir = path.join(rootDir, 'artifacts', `guanghe-${timestamp}`);
  const profileDir = path.join(rootDir, '.cache', 'guanghe-profile');
  ensureDir(artifactDir);
  ensureDir(profileDir);

  log('专业提示词');
  log([
    '使用本地浏览器自动化完成光合平台作品数据采集：打开光合平台登录页并等待用户扫码登录；登录成功后进入“内容数据 -> 作品分析”；填入内容 ID；将日期筛选设置为“30日”；打开指标选择器并勾选以下指标：内容查看次数、内容查看人数、种草成交金额、种草成交人数、商品点击次数；读取每个指标当前展示的数据值；保存关键步骤截图；将结果输出到终端并写入本地 JSON 文件。遇到页面结构变化时，优先尝试文本定位，其次允许用户手动补一步后继续，但不得绕过登录、验证码、权限或风控。'
  ].join('\n'));
  log('');

  const browserPath = resolveBrowserExecutable();
  log(`浏览器: ${browserPath}`);
  log(`输出目录: ${artifactDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: browserPath,
    viewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ]
  });

  const page = context.pages()[0] || await context.newPage();
  const networkLog = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const status = response.status();
      const headers = response.headers();
      const contentType = headers['content-type'] || headers['Content-Type'] || '';
      if (!/taobao|alicdn|guanghe/i.test(url)) return;
      if (!/json|javascript|text\//i.test(contentType)) return;
      const text = await response.text();
      if (!text || text.length > 300000) return;
      networkLog.push({
        time: new Date().toISOString(),
        url,
        status,
        contentType,
        text
      });
      if (networkLog.length > 120) networkLog.shift();
    } catch (error) {
      // ignore noisy response read failures
    }
  });

  try {
    await openLoginAndWait(page, artifactDir);
    await dismissInterferingOverlays(page);
    await takeScreenshot(page, path.join(artifactDir, '01-after-login.png'));

    const navSucceeded = await navigateToWorkAnalysis(page, artifactDir);
    if (!navSucceeded) {
      throw new Error('没有自动进入“内容数据 -> 作品分析”，需要继续补充页面定位规则。');
    }

    await fillContentId(page, args.contentId);
    await pickDateRange30Days(page);

    const metricsApplied = await chooseMetrics(page, DEFAULT_METRICS);
    if (!metricsApplied) {
      await manualCheckpoint(
        page,
        artifactDir,
        '我没有稳定定位到指标选择器。请在浏览器里手动勾选这 5 个指标后，回到终端按回车继续：内容查看次数、内容查看人数、种草成交金额、种草成交人数、商品点击次数。',
        '03-manual-metric-selection-needed.png'
      );
    }

    await settle(page);
    await takeScreenshot(page, path.join(artifactDir, '04-results.png'));

    const apiRecord = findApiRecord(networkLog, args.contentId);
    if (!apiRecord) {
      throw new Error(`接口未返回内容 ID ${args.contentId} 的作品数据，请确认该 ID 在当前账号、当前页面和近 30 日范围内可查。`);
    }

    const results = {};
    for (const metric of DEFAULT_METRICS) {
      results[metric] = extractMetricFromApiRecord(metric, apiRecord);
    }

    const resultPayload = {
      contentId: args.contentId,
      fetchedAt: new Date().toISOString(),
      pageUrl: page.url(),
      metrics: results,
      apiRecord
    };

    fs.writeFileSync(
      path.join(artifactDir, 'results.json'),
      JSON.stringify(resultPayload, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(artifactDir, 'network-log.json'),
      JSON.stringify(networkLog, null, 2),
      'utf8'
    );

    const summaryStripPath = path.join(artifactDir, '05-summary-strip.png');
    await createSummaryStripScreenshot(context, apiRecord, results, summaryStripPath);

    log('采集结果');
    for (const metric of DEFAULT_METRICS) {
      log(`- ${metric}: ${results[metric]?.value || '未识别'}`);
      if (results[metric]?.source) {
        log(`  来源: ${results[metric].source}`);
      }
    }
    log('');
    log(`结果文件: ${path.join(artifactDir, 'results.json')}`);
    log(`网络日志: ${path.join(artifactDir, 'network-log.json')}`);
    log(`结果截图: ${path.join(artifactDir, '04-results.png')}`);
    log(`汇总截图: ${summaryStripPath}`);
    log('脚本执行完成。浏览器会保留，你可以自己再核对一遍。');
  } catch (error) {
    await safeWriteError(artifactDir, error);
    log(`执行失败: ${error.message}`);
    log(`错误详情: ${path.join(artifactDir, 'error.txt')}`);
    throw error;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--content-id') {
      args.contentId = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === '--help' || current === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  log('用法: npm run guanghe:fetch -- --content-id 537029503554');
  log('');
  log('参数:');
  log('  --content-id   光合平台内容 ID');
  log('  --help, -h     显示帮助');
}

function resolveBrowserExecutable() {
  const platform = process.platform;
  const candidates = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else if (platform === 'win32') {
    candidates.push(
      `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`
    );
  } else {
    for (const command of ['google-chrome', 'chromium-browser', 'chromium', 'microsoft-edge']) {
      try {
        const resolved = execSync(`command -v ${command}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (resolved) candidates.push(resolved);
      } catch (error) {
        // ignore
      }
    }
  }

  for (const candidate of candidates.filter(Boolean)) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('没有找到可用浏览器。请安装 Chrome / Chromium 后重试。');
}

async function openLoginAndWait(page, artifactDir) {
  log('打开光合平台登录页...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await takeScreenshot(page, path.join(artifactDir, '00-login-page.png'));

  if (isLoggedInUrl(page.url())) {
    log('检测到已经处于登录态，跳过扫码。');
    return;
  }

  log('请在打开的浏览器窗口中扫码登录。');
  log('如果扫码后还需要二次确认，也请在手机上确认。');

  const loggedIn = await waitForLoginState(page, 180000);
  if (loggedIn) {
    log('登录成功。');
    return;
  }

  await manualCheckpoint(
    page,
    artifactDir,
    '我还没有自动检测到登录成功。如果你已经在浏览器中进入光合平台首页，请回到终端按回车继续。',
    '00-login-wait-timeout.png'
  );
}

function isLoggedInUrl(url) {
  return /creator\.guanghe\.taobao\.com/i.test(url) && !/login\.taobao\.com/i.test(url);
}

async function waitForLoginState(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isLoggedInUrl(page.url())) return true;
    try {
      const text = await page.textContent('body', { timeout: 2000 });
      if (text && /内容数据|内容灵感|我的作品|发布作品|发布内容|光合平台/i.test(text) && !/扫码登录|手机扫码登录/.test(text)) {
        return true;
      }
    } catch (error) {
      // ignore
    }
    await page.waitForTimeout(1500);
  }
  return false;
}

async function navigateToWorkAnalysis(page, artifactDir) {
  log('尝试进入“内容数据 -> 作品分析”...');
  await settle(page);
  await dismissInterferingOverlays(page);

  const alreadyThere = await page.getByText(/作品分析/).first().isVisible().catch(() => false);
  if (alreadyThere) {
    await takeScreenshot(page, path.join(artifactDir, '03-work-analysis.png'));
    return true;
  }

  let firstStep = await clickAnyText(page, CONTENT_DATA_CANDIDATES);
  if (!firstStep) {
    firstStep = await clickSidebarMenu(page, CONTENT_DATA_CANDIDATES);
  }
  if (firstStep) {
    await settle(page);
    await dismissInterferingOverlays(page);
    await takeScreenshot(page, path.join(artifactDir, '02-content-data.png'));
  }

  let secondStep = await clickAnyText(page, WORK_ANALYSIS_CANDIDATES);
  if (!secondStep) {
    secondStep = await clickSidebarMenu(page, WORK_ANALYSIS_CANDIDATES);
  }
  if (!secondStep) {
    secondStep = await page.evaluate((candidates) => {
      const items = [...document.querySelectorAll('span,div,a,li')];
      for (const candidate of candidates) {
        const el = items.find((node) => (node.textContent || '').replace(/\s+/g, ' ').includes(candidate));
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    }, WORK_ANALYSIS_CANDIDATES).catch(() => false);
  }

  if (secondStep) {
    await settle(page);
    await dismissInterferingOverlays(page);
    await takeScreenshot(page, path.join(artifactDir, '03-work-analysis.png'));
    return true;
  }

  return false;
}

async function dismissInterferingOverlays(page) {
  for (let round = 0; round < 4; round += 1) {
    let clicked = false;
    for (const text of OVERLAY_CLOSE_CANDIDATES) {
      const didClick = await clickAnyText(page, [text]);
      if (didClick) {
        clicked = true;
        await page.waitForTimeout(500);
      }
    }
    const closedByIcon = await page.evaluate(() => {
      const selectors = [
        '[class*=close]',
        '[class*=Close]',
        '.icon-close',
        '.close',
        '.next-icon-close',
        '[aria-label="关闭"]'
      ];
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node) {
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        }
      }
      return false;
    }).catch(() => false);
    if (closedByIcon) {
      clicked = true;
      await page.waitForTimeout(500);
    }
    if (!clicked) break;
  }
}

async function clickSidebarMenu(page, candidates) {
  for (const candidate of candidates) {
    const clicked = await page.evaluate((text) => {
      const nodes = [...document.querySelectorAll('aside *, nav *, [class*=menu] *, [class*=Menu] *')];
      const target = nodes.find((node) => {
        const value = (node.textContent || '').replace(/\s+/g, ' ').trim();
        return value && value.includes(text);
      });
      if (!target) return false;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }, candidate).catch(() => false);
    if (clicked) {
      await page.waitForTimeout(600);
      return true;
    }
  }
  return false;
}

async function fillContentId(page, contentId) {
  log(`填入内容 ID: ${contentId}`);
  const input = await findInputByKeywords(page, ['内容ID', '内容 Id', '内容id', '作品ID', '作品id', 'ID']);
  if (!input) {
    throw new Error('没有找到可填写内容 ID 的输入框。');
  }

  await input.click({ timeout: 5000 });
  await input.fill('');
  await input.fill(String(contentId));
  await page.waitForTimeout(500);

  const clicked = await clickAnyText(page, QUERY_BUTTON_CANDIDATES);
  if (!clicked) {
    await page.keyboard.press('Enter').catch(() => {});
  }
  await settle(page);
}

async function pickDateRange30Days(page) {
  log('选择 30 日时间范围...');
  const clicked = await clickAnyText(page, DATE_CANDIDATES);
  if (!clicked) {
    log('没有直接找到 30 日快捷筛选，继续使用当前页面状态。');
  }
  await settle(page);
}

async function chooseMetrics(page, metrics) {
  log('选择指标...');
  const opened = await clickAnyText(page, METRIC_TRIGGER_CANDIDATES);
  if (!opened) {
    return false;
  }

  await page.waitForTimeout(800);
  for (const metric of metrics) {
    const selected = await clickAnyText(page, [metric]);
    if (!selected) {
      log(`未稳定点击指标: ${metric}`);
    }
    await page.waitForTimeout(300);
  }

  await clickAnyText(page, ['确定', '完成', '应用', '确认']).catch(() => false);
  await settle(page);
  return true;
}

function findApiRecord(networkLog, contentId) {
  for (let index = networkLog.length - 1; index >= 0; index -= 1) {
    const entry = networkLog[index];
    if (!/kind\.pagelist/.test(entry.url || '')) continue;
    const parsed = parseJsonpPayload(entry.text || '');
    const result = (((parsed || {}).data || {}).model || {}).result || [];
    for (const item of result) {
      const candidateId = String(item?.contentId?.absolute || item?.contentInfo?.contentId || item?.contentInfo?.content?.id || '');
      if (candidateId === String(contentId)) {
        return item;
      }
    }
  }
  return null;
}

function extractMetricFromApiRecord(metric, apiRecord) {
  const field = METRIC_FIELD_MAP[metric];
  const rawValue = apiRecord?.[field]?.absolute;
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { value: null, source: `API (${field})` };
  }
  return { value: String(rawValue), source: `API (${field})` };
}

function parseJsonpPayload(text) {
  const match = String(text || '').match(/^\s*\w+\((.*)\)\s*;?\s*$/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}


async function createSummaryStripScreenshot(context, apiRecord, results, filePath) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 2050, height: 290 });
    await page.setContent(buildSummaryStripHtml(apiRecord, results), { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const images = Array.from(document.images || []);
      await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 3000);
        });
      }));
    });
    await page.locator('.summary-strip').screenshot({ path: filePath, timeout: 30000 });
  } finally {
    await page.close().catch(() => {});
  }
}

function buildSummaryStripHtml(apiRecord, results) {
  const content = apiRecord?.contentInfo?.content || {};
  const items = apiRecord?.contentInfo?.items || apiRecord?.contentInfo?.content?.items || apiRecord?.items || [];
  const firstItem = items[0] || {};
  const title = escapeHtml(content.title || '-');
  const contentId = escapeHtml(String(apiRecord?.contentId?.absolute || content.id || '-'));
  const releaseTime = escapeHtml(formatReleaseTime(content.releaseTime));
  const coverUrl = escapeHtml(content.coverUrl || '');
  const itemPic = escapeHtml(firstItem.itemPic || '');
  const itemCount = escapeHtml(`${items.length || 0}个商品`);
  const diagnosis = escapeHtml(`${apiRecord?.scoreInfo?.score || '-'}分`);
  const extraTraffic = Number(apiRecord?.scoreInfo?.consumeUvAdd || 0);
  const extraTrafficText = extraTraffic > 0 ? `预估额外流量：${formatNumber(extraTraffic)}` : '';

  const cells = [
    { label: '内容查看次数', value: formatMetricValue('内容查看次数', results) },
    { label: '内容查看人数', value: formatMetricValue('内容查看人数', results) },
    { label: '种草成交金额', value: formatMetricValue('种草成交金额', results, { currency: true }) },
    { label: '种草成交人数', value: formatMetricValue('种草成交人数', results) },
    { label: '商品点击次数', value: formatMetricValue('商品点击次数', results) }
  ];

  const metricColumns = cells.map((cell) => `
    <div class="metric-col">
      <div class="header">${escapeHtml(cell.label)}</div>
      <div class="value">${escapeHtml(cell.value)}</div>
      ${cell.label === '内容查看次数' && extraTrafficText ? `<div class="subtag">🔥 ${escapeHtml(extraTrafficText)}</div>` : '<div class="subtag placeholder"></div>'}
    </div>
  `).join('');

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        body { margin: 0; background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
        .summary-strip { width: 2048px; border: 1px solid #ececec; background: #fff; }
        .header-row, .data-row { display: grid; grid-template-columns: 470px 220px 270px 270px 270px 220px 170px 120px; }
        .header-row { background: #f5f5f7; color: #222; font-size: 18px; font-weight: 600; border-bottom: 1px solid #e8e8e8; }
        .header-row > div { padding: 14px 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .data-row > div { padding: 18px; min-height: 170px; border-right: 1px solid #f0f0f0; }
        .data-row > div:last-child, .header-row > div:last-child { border-right: none; }
        .content-info { display: flex; gap: 14px; align-items: flex-start; }
        .cover { width: 96px; height: 120px; border-radius: 14px; object-fit: cover; background: #f2f2f2; }
        .meta { flex: 1; min-width: 0; }
        .title { font-size: 20px; line-height: 1.4; color: #222; font-weight: 600; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sub { color: #777; font-size: 14px; line-height: 1.8; }
        .item-box { margin-top: 12px; border: 1px solid #ececec; border-radius: 12px; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px 0 14px; max-width: 300px; }
        .item-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; background: #f2f2f2; }
        .diagnosis-col { display: flex; flex-direction: column; justify-content: center; gap: 10px; }
        .diagnosis-title { font-size: 16px; color: #444; }
        .diagnosis-score { font-size: 38px; line-height: 1; font-weight: 700; color: #222; }
        .metric-col { display: flex; flex-direction: column; justify-content: center; gap: 14px; }
        .metric-col .header { display: none; }
        .metric-col .value { font-size: 40px; line-height: 1.1; color: #222; font-weight: 500; letter-spacing: 0.3px; }
        .metric-col .subtag { display: inline-flex; align-items: center; width: fit-content; font-size: 16px; color: #ff5a3d; background: #fff2ef; border-radius: 8px; padding: 8px 10px; }
        .metric-col .placeholder { visibility: hidden; }
        .action-col { display: flex; flex-direction: column; justify-content: center; gap: 18px; }
        .action-main { color: #3b82f6; font-size: 16px; font-weight: 600; }
        .action-sub { color: #bbb; font-size: 15px; }
      </style>
    </head>
    <body>
      <div class="summary-strip">
        <div class="header-row">
          <div>内容信息</div>
          <div>内容诊断</div>
          <div>内容查看次数</div>
          <div>内容查看人数</div>
          <div>种草成交金额</div>
          <div>种草成交人数</div>
          <div>商品点击次数</div>
          <div>操作</div>
        </div>
        <div class="data-row">
          <div>
            <div class="content-info">
              <img class="cover" src="${coverUrl}" />
              <div class="meta">
                <div class="title">${title}</div>
                <div class="sub">ID ${contentId}</div>
                <div class="sub">${releaseTime}</div>
                <div class="item-box">
                  <div class="sub" style="font-size: 16px; color: #666;">共1个商品</div>
                  <img class="item-thumb" src="${itemPic}" />
                </div>
              </div>
            </div>
          </div>
          <div class="diagnosis-col">
            <div class="diagnosis-title">内容总分</div>
            <div class="diagnosis-score">${diagnosis}</div>
          </div>
          ${metricColumns}
          <div class="action-col">
            <div class="action-main">已采集</div>
            <div class="action-sub">接口结果</div>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

function formatMetricValue(metric, results, options = {}) {
  const value = results?.[metric]?.value;
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(String(value).replace(/,/g, ''));
  if (!Number.isNaN(numeric)) {
    if (options.currency) return `¥ ${numeric.toLocaleString('en-US', { minimumFractionDigits: numeric % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
    return numeric.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return String(value);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatReleaseTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (input) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function clickAnyText(page, texts) {
  for (const text of texts) {
    const escaped = escapeRegExp(text);
    const patterns = [new RegExp(`^\\s*${escaped}\\s*$`), new RegExp(escaped)];
    const locators = [
      page.getByRole('button', { name: patterns[0] }).first(),
      page.getByRole('button', { name: patterns[1] }).first(),
      page.getByRole('tab', { name: patterns[1] }).first(),
      page.getByRole('link', { name: patterns[1] }).first(),
      page.getByRole('menuitem', { name: patterns[1] }).first(),
      page.getByRole('option', { name: patterns[1] }).first(),
      page.getByText(patterns[0]).first(),
      page.getByText(patterns[1]).first()
    ];

    for (const locator of locators) {
      try {
        if (await locator.isVisible({ timeout: 1200 })) {
          await locator.click({ timeout: 5000 });
          return true;
        }
      } catch (error) {
        // keep trying
      }
    }
  }
  return false;
}

async function findInputByKeywords(page, keywords) {
  for (const keyword of keywords) {
    const escaped = escapeRegExp(keyword);
    const regex = new RegExp(escaped, 'i');
    const locators = [
      page.getByLabel(regex).first(),
      page.locator(`input[placeholder*="${keyword}"]`).first(),
      page.locator(`textarea[placeholder*="${keyword}"]`).first(),
      page.locator(`xpath=//*[contains(normalize-space(), "${keyword}")]/following::input[1]`).first(),
      page.locator(`xpath=//*[contains(normalize-space(), "${keyword}")]/following::textarea[1]`).first(),
      page.locator('input[type="text"]').first(),
      page.locator('input').first()
    ];

    for (const locator of locators) {
      try {
        if (await locator.isVisible({ timeout: 1000 })) {
          return locator;
        }
      } catch (error) {
        // ignore
      }
    }
  }
  return null;
}

async function manualCheckpoint(page, artifactDir, message, filename) {
  await takeScreenshot(page, path.join(artifactDir, filename));
  log(message);
  await ask('按回车继续...');
  await settle(page);
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);
}

async function takeScreenshot(page, filePath) {
  try {
    await page.screenshot({ path: filePath, fullPage: true, timeout: 30000 });
  } catch (error) {
    fs.writeFileSync(filePath.replace(/\.png$/, '.txt'), `Screenshot failed: ${error.message}\n`, 'utf8');
  }
}

async function safeWriteError(artifactDir, error) {
  try {
    fs.writeFileSync(path.join(artifactDir, 'error.txt'), `${error.stack || error.message}\n`, 'utf8');
  } catch (writeError) {
    // ignore
  }
}

function ask(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function log(message) {
  process.stdout.write(String(message) + '\n');
}

main().catch((error) => {
  log(`执行失败: ${error.message}`);
  process.exitCode = 1;
});
