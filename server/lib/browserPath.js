const fs = require('fs')
const { execSync } = require('child_process')

function resolveBrowserExecutable() {
  const platform = process.platform
  const candidates = []

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    )
  } else if (platform === 'win32') {
    candidates.push(
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`
    )
  } else {
    for (const command of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'microsoft-edge']) {
      try {
        const resolved = execSync(`command -v ${command}`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
        if (resolved) candidates.push(resolved)
      } catch (error) {
        // ignore missing binaries
      }
    }
  }

  for (const candidate of candidates.filter(Boolean)) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error('没有找到可用浏览器。请安装 Chrome / Chromium 后重试。')
}

module.exports = { resolveBrowserExecutable }
