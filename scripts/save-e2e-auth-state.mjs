import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const baseURL = process.env.TEUMSAE_E2E_BASE_URL ?? 'http://localhost:3000'
const outputPath = process.env.TEUMSAE_E2E_AUTH_STATE

if (!outputPath) {
  process.stderr.write('TEUMSAE_E2E_AUTH_STATE에 저장할 테스트 세션 파일 경로를 지정하세요.\n')
  process.exit(1)
}

const browser = await chromium.launch({ headless: false })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(new URL('/auth', baseURL).toString())
  await page.waitForURL(url => url.pathname === '/schedule', { timeout: 300_000 })
  const state = await context.storageState()
  const resolvedOutput = resolve(outputPath)
  await mkdir(dirname(resolvedOutput), { recursive: true, mode: 0o700 })
  await writeFile(resolvedOutput, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
  process.stdout.write('로그인 세션을 지정한 로컬 경로에 저장했습니다. 저장소에는 포함되지 않습니다.\n')
  await context.close()
} catch {
  process.stderr.write('로그인 세션을 저장하지 못했습니다. 로컬 서버와 인증 리다이렉트를 확인하세요.\n')
  process.exitCode = 1
} finally {
  await browser.close()
}
