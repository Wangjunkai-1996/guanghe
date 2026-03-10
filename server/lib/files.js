const fs = require('fs')
const path = require('path')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

async function ensureDirAsync(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return fallback
  }
}

async function readJsonAsync(filePath, fallback) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    return fallback
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

async function writeJsonAsync(filePath, value) {
  await ensureDirAsync(path.dirname(filePath))
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function removeDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return
  fs.rmSync(dirPath, { recursive: true, force: true })
}

async function removeDirAsync(dirPath) {
  if (!dirPath) return
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true })
  } catch (error) {
    // Ignore if doesn't exist
  }
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
  ensureDirAsync,
  readJson,
  readJsonAsync,
  writeJson,
  writeJsonAsync,
  removeDir,
  removeDirAsync,
  formatTimestamp,
  toArtifactUrl
}
