import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

const baseURL = process.env.TEUMSAE_E2E_BASE_URL ?? 'http://localhost:3000'

function addDays(date: string, days: number) {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function todayInKorea() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function loadEvents(page: import('@playwright/test').Page, date: string) {
  const responsePromise = page.waitForResponse(response => response.url().includes('/rest/v1/events') && response.request().method() === 'GET')
  await page.goto(new URL('/schedule?view=week&date=' + date, baseURL).toString())
  const response = await responsePromise
  if (!response.ok()) throw new Error('테스트 일정 조회에 실패했습니다.')
  return await response.json() as Array<{ id: string; title: string; starts_at: string; ends_at: string; version: number }>
}

async function findFreeSlot(page: import('@playwright/test').Page) {
  for (let offset = 15; offset < 46; offset += 1) {
    const date = addDays(todayInKorea(), offset)
    const events = await loadEvents(page, date)
    for (let hour = 9; hour < 21; hour += 1) {
      const start = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`)
      const end = start + 60 * 60 * 1000
      if (events.every(event => Date.parse(event.starts_at) >= end || Date.parse(event.ends_at) <= start)) return { date, start: String(hour).padStart(2, '0') + ':00', end: String(hour + 1).padStart(2, '0') + ':00' }
    }
  }
  throw new Error('테스트 계정에서 AI 등록 테스트에 사용할 빈 시간을 찾지 못했습니다.')
}

test('실제 AI 제안의 동시 확인은 같은 일정 하나만 만든다', async ({ page }) => {
  const eventTitle = 'issue10-confirm-' + randomUUID()
  let targetDate: string | null = null
  try {
    const slot = await findFreeSlot(page)
    targetDate = slot.date
    const prompt = `${slot.date} ${slot.start}부터 ${slot.end}까지 ${eventTitle} 일정을 준비해줘`
    const proposalResponse = await page.request.post(new URL('/api/chat', baseURL).toString(), { data: { message: prompt, conversationId: null, version: null, requestId: randomUUID() } })
    const proposalPayload = await proposalResponse.json() as { cards?: Array<{ type?: string; id?: string; title?: string; state?: string }>; toolCalls?: Array<{ name?: string; status?: string }> }
    const proposal = proposalPayload.cards?.find(card => card.type === 'proposal' && card.state === 'pending')
    expect(proposalResponse.ok()).toBe(true)
    expect(proposalPayload.toolCalls?.some(call => call.name === 'prepareEvent' && call.status === 'success')).toBe(true)
    expect(proposal?.id).toBeTruthy()
    expect(proposal?.title).toBe(eventTitle)
    if (!proposal?.id) return

    const confirmationUrl = new URL('/api/proposals/' + proposal.id + '/confirm', baseURL).toString()
    const results = await Promise.all([page.request.post(confirmationUrl), page.request.post(confirmationUrl)])
    const payloads = await Promise.all(results.map(result => result.json())) as Array<{ status?: string; event?: { id?: string } }>
    expect(results.every(result => result.ok())).toBe(true)
    expect(payloads.every(payload => payload.status === 'confirmed')).toBe(true)
    expect(payloads[0].event?.id).toBeTruthy()
    expect(payloads[0].event?.id).toBe(payloads[1].event?.id)
    const events = await loadEvents(page, slot.date)
    expect(events.filter(event => event.title === eventTitle)).toHaveLength(1)
  } finally {
    if (targetDate) {
      await loadEvents(page, targetDate)
      const event = page.locator('.real-event-card').filter({ hasText: eventTitle })
      if (await event.count()) {
        await event.getByRole('button', { name: '삭제' }).click()
        await event.getByRole('button', { name: '삭제 확인' }).click()
        await expect(event).toHaveCount(0)
      }
    }
  }
})
