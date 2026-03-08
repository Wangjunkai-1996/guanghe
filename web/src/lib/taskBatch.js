export function parseTaskBatchInput(input) {
  const lines = String(input || '').split(/\r?\n/)
  const tasks = []
  const errors = []

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return

    const parsed = splitTaskLine(rawLine)
    if (!parsed) {
      errors.push({ line: index + 1, message: '请按“备注,内容ID”或“备注<TAB>内容ID”填写' })
      return
    }

    const remark = parsed.remark.trim()
    const contentId = parsed.contentId.trim()

    if (!remark) {
      errors.push({ line: index + 1, message: '备注不能为空' })
      return
    }
    if (!/^\d+$/.test(contentId)) {
      errors.push({ line: index + 1, message: '内容 ID 只能包含数字' })
      return
    }

    tasks.push({ remark, contentId })
  })

  if (tasks.length === 0 && errors.length === 0) {
    errors.push({ line: 0, message: '请至少输入一条任务' })
  }

  return { tasks, errors }
}

function splitTaskLine(line) {
  const separator = detectSeparator(line)
  if (!separator) return null
  const parts = line.split(separator).map((item) => item.trim())
  if (parts.length !== 2) return null
  return {
    remark: parts[0],
    contentId: parts[1]
  }
}

function detectSeparator(line) {
  if (line.includes('\t')) return '\t'
  if (line.includes(',')) return ','
  if (line.includes('，')) return '，'
  return ''
}
