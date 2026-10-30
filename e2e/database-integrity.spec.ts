import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

const baseURL = process.env.TEUMSAE_E2E_BASE_URL ?? 'http://localhost:3000'

function addDays(date: string, days: number) {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function todayInKorea() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function scheduleUrl(date: string) {
  return new URL('/schedule?view=week&date=' + date, baseURL).toString()
}

async function loadEvents(page: Page, date: string) {
  const responsePromise = page.waitForResponse(response => response.url().includes('/rest/v1/events') && response.request().method() === 'GET')
  await page.goto(scheduleUrl(date))
  const response = await responsePromise
  if (!response.ok()) throw new Error('테스트 일정 조회가 실패했습니다. 테스트 세션과 DB 연결을 확인하세요.')
  return await response.json() as Array<{ starts_at: string; ends_at: string }>
}

async function findFreeSlot(page: Page, initialDate: string) {
  for (let offset = 0; offset < 31; offset += 1) {
    const date = addDays(initialDate, offset)
    const events = await loadEvents(page, date)
    for (let hour = 9; hour < 21; hour += 1) {
      const start = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`)
      const end = start + 60 * 60 * 1000
      if (events.every(event => Date.parse(event.starts_at) >= end || Date.parse(event.ends_at) <= start)) {
        return { date, start: String(hour).padStart(2, '0') + ':00', end: String(hour + 1).padStart(2, '0') + ':00' }
      }
    }
  }
  throw new Error('테스트 계정의 향후 31일 일정에서 1시간 빈 시간을 찾지 못했습니다.')
}

async function setTime(form: Locator, label: string, time: string) {
  await form.getByRole('button', { name: new RegExp(label + ' 선택') }).click()
  const dialog = form.getByRole('dialog', { name: label + ' 선택' })
  await dialog.getByRole('button', { name: time.slice(0, 2), exact: true }).click()
  await dialog.getByRole('button', { name: time.slice(3), exact: true }).click()
}

async function prepareEvent(page: Page, date: string, title: string, startTime: string, endTime: string) {
  await page.goto(scheduleUrl(date))
  await page.getByRole('button', { name: '＋ 일정' }).click()
  const form = page.locator('form.real-event-form')
  await form.getByLabel('일정 이름').fill(title)
  await setTime(form, '시작 시간', startTime)
  await setTime(form, '종료 시간', endTime)
}

async function createEvent(page: Page, date: string, title: string, startTime: string, endTime: string) {
  await prepareEvent(page, date, title, startTime, endTime)
  const form = page.locator('form.real-event-form')
  await form.getByRole('button', { name: '일정 저장' }).click()
}

async function removeTestEvent(page: Page, title: string) {
  try {
    const card = page.locator('.real-event-card').filter({ hasText: title })
    if (!await card.count()) return
    await card.getByRole('button', { name: '삭제' }).click()
    await card.getByRole('button', { name: '삭제 확인' }).click()
    await expect(card).toHaveCount(0)
  } catch {
    process.stderr.write('테스트 일정 일부가 남았을 수 있습니다. 테스트 계정의 달력에서 정리해 주세요.\n')
  }
}

async function createContextPage(browser: Browser, statePath: string) {
  const context = await browser.newContext({ storageState: statePath })
  return { context, page: await context.newPage() }
}

test('두 계정 데이터는 분리되고 두 탭의 같은 시간 저장은 한 건만 허용된다', async ({ browser }) => {
  const stateA = process.env.TEUMSAE_E2E_AUTH_STATE
  const stateB = process.env.TEUMSAE_E2E_USER_B_STATE
  if (!stateA || !stateB || process.env.TEUMSAE_E2E_ALLOW_DATABASE_WRITES !== 'YES') test.skip(true, '전용 테스트 DB, A·B 세션 파일, 쓰기 확인값이 필요합니다.')
  const userA = await createContextPage(browser, stateA!)
  const userASecondTab = await userA.context.newPage()
  const userB = await createContextPage(browser, stateB!)
  const testPrefix = 'issue10-' + randomUUID()
  const firstTitle = testPrefix + '-owner'
  const racingTitleA = testPrefix + '-race-a'
  const racingTitleB = testPrefix + '-race-b'
  let eventDate = addDays(todayInKorea(), 10)
  let raceDate = eventDate

  try {
    const ownerSlot = await findFreeSlot(userA.page, eventDate)
    eventDate = ownerSlot.date
    await createEvent(userA.page, ownerSlot.date, firstTitle, ownerSlot.start, ownerSlot.end)
    await expect(userA.page.locator('.real-event-card').filter({ hasText: firstTitle })).toBeVisible()

    await loadEvents(userB.page, ownerSlot.date)
    await expect(userB.page.getByText(firstTitle, { exact: true })).toHaveCount(0)

    const raceSlot = await findFreeSlot(userA.page, ownerSlot.date)
    raceDate = raceSlot.date
    await Promise.all([
      prepareEvent(userA.page, raceSlot.date, racingTitleA, raceSlot.start, raceSlot.end),
      prepareEvent(userASecondTab, raceSlot.date, racingTitleB, raceSlot.start, raceSlot.end)
    ])
    await Promise.all([
      userA.page.locator('form.real-event-form button[type="submit"]').click(),
      userASecondTab.locator('form.real-event-form button[type="submit"]').click()
    ])
    await expect.poll(async () => (await userA.page.getByRole('alert').count()) + (await userASecondTab.getByRole('alert').count())).toBeGreaterThan(0)

    await Promise.all([userA.page.reload(), userASecondTab.reload()])
    const [titlesA, titlesB] = await Promise.all([
      userA.page.locator('.real-event-card h3').allTextContents(),
      userASecondTab.locator('.real-event-card h3').allTextContents()
    ])
    const raceTitles = new Set([...titlesA, ...titlesB].filter(title => title === racingTitleA || title === racingTitleB))
    expect(raceTitles.size).toBe(1)
  } finally {
    await Promise.all([...new Set([eventDate, raceDate])].map(date => loadEvents(userA.page, date).catch(() => undefined)))
    await removeTestEvent(userA.page, firstTitle)
    await removeTestEvent(userA.page, racingTitleA)
    await removeTestEvent(userA.page, racingTitleB)
    await Promise.all([userA.context.close(), userB.context.close()])
  }
})
