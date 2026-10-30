import { defineConfig, devices } from '@playwright/test'

const authState = process.env.TEUMSAE_E2E_AUTH_STATE
const liveDatabaseEnabled = process.env.TEUMSAE_E2E_ALLOW_DATABASE_WRITES === 'YES'
const secondUserState = process.env.TEUMSAE_E2E_USER_B_STATE
const mobileChrome = { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const projects = [
  { name: 'sample-desktop', testMatch: 'sample-schedule.spec.ts', use: { ...devices['Desktop Chrome'] } },
  { name: 'sample-mobile', testMatch: 'sample-schedule.spec.ts', use: mobileChrome }
]

if (!authState) console.info('E2E 범위: 샘플 데스크톱·모바일만 실행합니다. 인증 테스트는 TEUMSAE_E2E_AUTH_STATE가 필요합니다.')
if (authState) {
  projects.push({ name: 'authenticated-desktop', testMatch: 'authenticated-flow.spec.ts', use: { ...devices['Desktop Chrome'], storageState: authState } } as typeof projects[number])
  projects.push({ name: 'authenticated-mobile', testMatch: 'authenticated-flow.spec.ts', use: { ...mobileChrome, storageState: authState } } as typeof projects[number])
}
if (!liveDatabaseEnabled || !secondUserState) console.info('E2E 범위: 실제 DB 권한·동시성 검사는 전용 두 계정 세션과 TEUMSAE_E2E_ALLOW_DATABASE_WRITES=YES가 필요합니다.')
if (process.env.TEUMSAE_E2E_LIVE_AI !== 'YES') console.info('E2E 범위: 실제 AI 동시 확인 검사는 TEUMSAE_E2E_LIVE_AI=YES로 별도 실행합니다.')
if (authState && secondUserState && liveDatabaseEnabled) projects.push({ name: 'database-integrity', testMatch: 'database-integrity.spec.ts', use: { ...devices['Desktop Chrome'], storageState: authState } } as typeof projects[number])
if (authState && liveDatabaseEnabled && process.env.TEUMSAE_E2E_LIVE_AI === 'YES') projects.push({ name: 'live-ai-integrity', testMatch: 'live-ai-integrity.spec.ts', use: { ...devices['Desktop Chrome'], storageState: authState } } as typeof projects[number])

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: process.env.TEUMSAE_E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects,
  webServer: process.env.TEUMSAE_E2E_BASE_URL ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
