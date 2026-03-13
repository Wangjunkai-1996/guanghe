import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'

const { AccountStore } = require('../server/lib/accountStore')
const { GuangheLoginService } = require('../server/services/loginService')

function createHarness() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guanghe-login-service-'))
  const accountsFile = path.join(rootDir, 'data', 'accounts.json')
  const profileRootDir = path.join(rootDir, '.cache', 'profiles')
  const accountStore = new AccountStore({ accountsFile })
  const browserManager = {
    profileRootDir,
    resolveProfileDir: (dir) => (path.isAbsolute(dir) ? dir : path.join(profileRootDir, dir)),
    closeAccount: vi.fn(async () => {}),
    adoptLoginSession: vi.fn(() => null)
  }
  const service = new GuangheLoginService({
    browserManager,
    accountStore,
    artifactsRootDir: path.join(rootDir, 'artifacts', 'web')
  })

  return { rootDir, accountsFile, profileRootDir, accountStore, browserManager, service }
}

describe('loginService', () => {
  test('persists a newly logged-in account immediately', async () => {
    const harness = createHarness()
    const profileDir = path.join(harness.profileRootDir, 'login-sessions', 'session-1')

    await harness.service.persistLoggedInAccount('session-1', {
      accountId: '1001',
      nickname: '涵涵麻麻',
      avatar: 'https://example.com/avatar.png',
      certDesc: '母婴博主'
    }, profileDir)

    expect(fs.existsSync(harness.accountsFile)).toBe(true)

    const payload = JSON.parse(fs.readFileSync(harness.accountsFile, 'utf8'))
    expect(payload.accounts).toHaveLength(1)
    expect(payload.accounts[0]).toMatchObject({
      accountId: '1001',
      nickname: '涵涵麻麻',
      profileDir: path.join('login-sessions', 'session-1'),
      status: 'READY'
    })
    expect(harness.browserManager.adoptLoginSession).toHaveBeenCalledWith('session-1', '1001')
  })

  test('marks stored ready accounts as login required when local profile is missing', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guanghe-login-service-'))
    const accountsFile = path.join(rootDir, 'data', 'accounts.json')
    const profileRootDir = path.join(rootDir, '.cache', 'profiles')

    fs.mkdirSync(path.dirname(accountsFile), { recursive: true })
    fs.writeFileSync(accountsFile, JSON.stringify({
      accounts: [{
        accountId: '2001',
        nickname: '跨机器账号',
        avatar: '',
        certDesc: '',
        profileDir: path.join('login-sessions', 'missing-profile'),
        status: 'READY',
        lastLoginAt: '2026-03-13T00:00:00.000Z'
      }]
    }, null, 2))

    const accountStore = new AccountStore({ accountsFile })
    const browserManager = {
      profileRootDir,
      resolveProfileDir: (dir) => (path.isAbsolute(dir) ? dir : path.join(profileRootDir, dir)),
      closeAccount: vi.fn(async () => {}),
      adoptLoginSession: vi.fn(() => null)
    }

    const service = new GuangheLoginService({
      browserManager,
      accountStore,
      artifactsRootDir: path.join(rootDir, 'artifacts', 'web')
    })

    expect(service.listAccounts()).toMatchObject([
      {
        accountId: '2001',
        nickname: '跨机器账号',
        status: 'LOGIN_REQUIRED'
      }
    ])

    const payload = JSON.parse(fs.readFileSync(accountsFile, 'utf8'))
    expect(payload.accounts[0].status).toBe('LOGIN_REQUIRED')
  })
})
