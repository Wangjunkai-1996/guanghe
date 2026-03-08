const fs = require('fs')
const path = require('path')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return fallback
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function removeDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return
  fs.rmSync(dirPath, { recursive: true, force: true })
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('')
}

function toArtifactUrl(relativePath) {
  return `/api/artifacts/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  removeDir,
  formatTimestamp,
  toArtifactUrl
}
