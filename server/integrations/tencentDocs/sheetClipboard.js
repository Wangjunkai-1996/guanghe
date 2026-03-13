function parseClipboardTable(rawText) {
  const normalizedText = String(rawText || '').replace(/\r\n/g, '\n')
  const physicalLines = normalizedText.split('\n')
  const physicalRows = physicalLines
    .map((line) => line.split('\t'))
    .filter((cells) => cells.length > 1 || String(cells[0] || '').trim() !== '')

  const columnCount = physicalRows.reduce((max, cells) => Math.max(max, cells.length), 0)
  if (!columnCount) {
    return {
      columnCount: 0,
      physicalLineCount: 0,
      logicalRowCount: 0,
      headers: [],
      rows: []
    }
  }

  const logicalRows = mergePhysicalRows(physicalRows, columnCount)
    .map((cells) => padCells(cells, columnCount))

  if (logicalRows.length === 0) {
    return {
      columnCount,
      physicalLineCount: physicalRows.length,
      logicalRowCount: 0,
      headers: [],
      rows: []
    }
  }

  const headers = repairKnownHeaderPatterns(logicalRows[0].map(normalizeHeaderCell))
  const rows = logicalRows
    .slice(1)
    .map((values, index) => {
      const cells = {}
      headers.forEach((header, columnIndex) => {
        if (!header) return
        cells[header] = values[columnIndex] ?? ''
      })

      return {
        sheetRow: index + 2,
        values,
        cells,
        nickname: pickCell(headers, values, ['逛逛昵称']),
        contentId: pickCell(headers, values, ['内容id', '内容ID'])
      }
    })
    .filter((row) => row.values.some((cell) => String(cell || '').trim() !== ''))

  return {
    columnCount,
    physicalLineCount: physicalRows.length,
    logicalRowCount: logicalRows.length,
    headers,
    rows
  }
}

function parseClipboardDataRows(rawText, headers = [], { startSheetRow = 2 } = {}) {
  const normalizedHeaders = Array.isArray(headers)
    ? headers.map(normalizeHeaderCell)
    : []
  const normalizedText = String(rawText || '').replace(/\r\n/g, '\n')
  const physicalLines = normalizedText.split('\n')
  const physicalRows = physicalLines
    .map((line) => line.split('\t'))
    .filter((cells) => cells.length > 1 || String(cells[0] || '').trim() !== '')

  const columnCount = Math.max(
    normalizedHeaders.length,
    physicalRows.reduce((max, cells) => Math.max(max, cells.length), 0)
  )

  if (!columnCount || normalizedHeaders.length === 0) {
    return {
      columnCount,
      physicalLineCount: physicalRows.length,
      logicalRowCount: 0,
      headers: normalizedHeaders,
      rows: []
    }
  }

  const logicalRows = mergePhysicalRows(physicalRows, columnCount)
    .map((cells) => padCells(cells, columnCount))

  const rows = logicalRows
    .map((values, index) => {
      const cells = {}
      normalizedHeaders.forEach((header, columnIndex) => {
        if (!header) return
        cells[header] = values[columnIndex] ?? ''
      })

      return {
        sheetRow: Number(startSheetRow) + index,
        values,
        cells,
        nickname: pickCell(normalizedHeaders, values, ['逛逛昵称']),
        contentId: pickCell(normalizedHeaders, values, ['内容id', '内容ID'])
      }
    })
    .filter((row) => row.values.some((cell) => String(cell || '').trim() !== ''))

  return {
    columnCount,
    physicalLineCount: physicalRows.length,
    logicalRowCount: logicalRows.length,
    headers: normalizedHeaders,
    rows
  }
}

function mergePhysicalRows(physicalRows, columnCount) {
  const merged = []
  let currentRow = null

  for (const cells of physicalRows) {
    if (!currentRow) {
      currentRow = cells.slice()
    } else if (currentRow.length < columnCount) {
      currentRow[currentRow.length - 1] = appendMultilineValue(currentRow[currentRow.length - 1], cells[0])
      currentRow.push(...cells.slice(1))
    } else {
      merged.push(currentRow)
      currentRow = cells.slice()
    }

    if (currentRow.length >= columnCount) {
      merged.push(currentRow.slice(0, columnCount))
      currentRow = null
    }
  }

  if (currentRow) {
    merged.push(currentRow)
  }

  return merged
}

function appendMultilineValue(previousValue, nextLineValue) {
  const previous = String(previousValue || '')
  const next = String(nextLineValue || '')
  return previous ? `${previous}\n${next}` : next
}

function padCells(cells, columnCount) {
  const padded = cells.slice(0, columnCount)
  while (padded.length < columnCount) {
    padded.push('')
  }
  return padded.map((cell) => String(cell ?? ''))
}

function normalizeHeaderCell(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function repairKnownHeaderPatterns(headers) {
  const repaired = headers.slice()
  if (repaired[0] !== '逛逛昵称' && repaired[1] === '逛逛ID' && ['内容id', '内容ID'].includes(repaired[2])) {
    repaired[0] = '逛逛昵称'
  }
  return repaired
}

function pickCell(headers, values, candidates) {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header === candidate)
    if (index >= 0) {
      return values[index] ?? ''
    }
  }
  return ''
}

module.exports = {
  parseClipboardTable,
  parseClipboardDataRows,
  normalizeHeaderCell
}
