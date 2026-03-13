const DEFAULT_PAGE_GOTO_TIMEOUT_MS = 60 * 1000

function resolveGotoTimeoutMs(rawValue = process.env.PAGE_GOTO_TIMEOUT_MS) {
  const numericValue = Number(rawValue || DEFAULT_PAGE_GOTO_TIMEOUT_MS)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : DEFAULT_PAGE_GOTO_TIMEOUT_MS
}

function isNavigationTimeoutError(error) {
  return /Timeout \d+ms exceeded/i.test(String(error?.message || ''))
}

async function gotoWithFallback(page, url, {
  waitUntil = 'domcontentloaded',
  timeoutMs = resolveGotoTimeoutMs(),
  settleMs = 0,
  canTreatTimeoutAsSuccess = null
} = {}) {
  try {
    await page.goto(url, { waitUntil, timeout: timeoutMs })
  } catch (error) {
    if (!isNavigationTimeoutError(error)) {
      throw error
    }

    let canContinue = false
    if (typeof canTreatTimeoutAsSuccess === 'function') {
      try {
        canContinue = await canTreatTimeoutAsSuccess(page)
      } catch (_error) {
        canContinue = false
      }
    }

    if (!canContinue) {
      throw error
    }
  }

  if (settleMs > 0) {
    await page.waitForTimeout(settleMs)
  }
}

module.exports = {
  DEFAULT_PAGE_GOTO_TIMEOUT_MS,
  resolveGotoTimeoutMs,
  isNavigationTimeoutError,
  gotoWithFallback
}
