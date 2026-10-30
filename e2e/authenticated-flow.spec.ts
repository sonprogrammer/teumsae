import { expect, test } from '@playwright/test'

const conversationId = '30000000-0000-4000-8000-000000000003'
const searchId = '40000000-0000-4000-8000-000000000004'
const firstCandidateId = '50000000-0000-4000-8000-000000000005'
const secondCandidateId = '60000000-0000-4000-8000-000000000006'
const proposalId = '70000000-0000-4000-8000-000000000007'

function koreaDateOffset(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const date = new Date(today + 'T00:00:00.000Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

test('일정 확인 뒤 두 번째 후보를 등록 확인하고 저장 결과를 확인한다', async ({ page }) => {
  const date = koreaDateOffset(1)
  const startsAt = date + 'T02:00:00.000Z'
  const endsAt = date + 'T03:00:00.000Z'
  let events: Array<{ id: string; title: string; note: string | null; starts_at: string; ends_at: string; version: number }> = []
  let chatTurn = 0
  let persistedMessages: Array<Record<string, unknown>> = []
  let conversationVersion = 1

  await page.route(/\/rest\/v1\/events(?:\?|$)/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events), headers: { 'content-range': '0-0/*' } }))
  await page.route('**/api/chat', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { conversation: persistedMessages.length ? { id: conversationId, version: conversationVersion, messages: persistedMessages } : null }, headers: { 'cache-control': 'private, no-store' } })
    chatTurn += 1
    const userText = chatTurn === 1 ? '내일 빈 시간 찾아줘' : '두 번째 후보에 운동 일정 추가해줘'
    const userMessage = { role: 'user', content: userText, createdAt: new Date().toISOString() }
    if (chatTurn === 1) {
      const card = {
        type: 'availability', startDate: date, endDate: date, searchId,
        candidateIds: [firstCandidateId, secondCandidateId], conflicts: [],
        result: { mode: 'candidates', candidates: [{ date, start: '10:00', end: '11:00' }, { date, start: '11:00', end: '12:00' }], hasMore: false }
      }
      const assistantMessage = { role: 'assistant', content: '빈 시간 후보를 아래 카드에 표시했어요.', cards: [card], createdAt: new Date().toISOString() }
      persistedMessages = [userMessage, assistantMessage]
      conversationVersion = 2
      return route.fulfill({ json: { response: assistantMessage.content, answerSource: 'tool_summary', conversationId, version: 2, cards: [card], messages: [userMessage, assistantMessage] } })
    }
    const card = { type: 'proposal', id: proposalId, title: '운동', note: null, startsAt, endsAt, expiresAt: new Date(Date.now() + 600_000).toISOString(), settingsVersion: 1, state: 'pending' }
    const assistantMessage = { role: 'assistant', content: '등록 전에 내용을 확인해 주세요.', cards: [card], createdAt: new Date().toISOString() }
    persistedMessages = [...persistedMessages, userMessage, assistantMessage]
    conversationVersion = 3
    return route.fulfill({ json: { response: assistantMessage.content, answerSource: 'model', conversationId, version: 3, cards: [card], messages: persistedMessages } })
  })
  await page.route('**/api/proposals/' + proposalId + '/confirm', async route => {
    events = [{ id: '80000000-0000-4000-8000-000000000008', title: '운동', note: null, starts_at: startsAt, ends_at: endsAt, version: 1 }]
    persistedMessages = persistedMessages.map(message => ({ ...message, cards: Array.isArray(message.cards) ? message.cards.map(card => card && typeof card === 'object' && card.type === 'proposal' ? { ...card, state: 'confirmed', eventId: events[0].id } : card) : undefined }))
    return route.fulfill({ json: { status: 'confirmed', event: events[0], message: '일정을 등록했어요.' } })
  })

  await page.goto('/schedule?view=week&date=' + date)
  await expect(page.getByRole('heading', { name: '내 일정' })).toBeVisible()
  await page.getByRole('button', { name: 'AI에게 물어보기' }).click()
  const panel = page.getByRole('complementary', { name: 'AI 일정 도우미' })
  const input = panel.getByRole('textbox', { name: '일정 질문' })
  await input.fill('내일 빈 시간 찾아줘')
  await panel.getByRole('button', { name: '질문 보내기' }).click()
  const candidates = panel.getByRole('region', { name: '빈 시간 후보' }).getByRole('button')
  await expect(candidates).toHaveCount(2)
  await candidates.nth(1).click()
  await input.fill('두 번째 후보에 운동 일정 추가해줘')
  await panel.getByRole('button', { name: '질문 보내기' }).click()
  const confirmation = panel.getByRole('region', { name: '일정 등록 확인' })
  await expect(confirmation.getByText('아직 저장되지 않았어요')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '선택한 날짜 일정' }).getByText('이 날은 비어 있어요')).toBeVisible()
  await confirmation.getByRole('button', { name: '이 일정으로 등록' }).click()
  await expect(confirmation.getByText('일정에 추가됨')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '선택한 날짜 일정' }).getByRole('heading', { name: '운동' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'AI에게 물어보기' }).click()
  await expect(page.getByRole('complementary', { name: 'AI 일정 도우미' }).getByText('일정에 추가됨')).toBeVisible()
})
