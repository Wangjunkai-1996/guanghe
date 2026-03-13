import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const { getAppPaths } = require('../server/lib/constants')

const repoRootDir = process.cwd()

describe('constants', () => {
  test('getAppPaths defaults to repository root instead of current working directory', () => {
    const originalCwd = process.cwd()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guanghe-paths-'))

    process.chdir(tempDir)
    try {
      const paths = getAppPaths()
      expect(paths.rootDir).toBe(repoRootDir)
      expect(paths.accountsFile).toBe(path.join(repoRootDir, 'data', 'accounts.json'))
      expect(paths.profileRootDir).toBe(path.join(repoRootDir, '.cache', 'profiles'))
    } finally {
      process.chdir(originalCwd)
    }
  })
})
