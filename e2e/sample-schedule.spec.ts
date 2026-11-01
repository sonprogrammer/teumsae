import { expect, test } from '@playwright/test'

test('샘플 일정에서 후보 선택과 등록 확인을 모바일·데스크톱으로 마칠 수 있다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('샘플 데이터', { exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 1280) <= 600) await page.getByRole('button', { name: /틈새에게 물어보기/ }).click()
  const dialog = page.getByRole('dialog', { name: '틈새 샘플 대화' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('샘플 대화 · 실제 AI 연결 전')).toBeVisible()
  const candidates = dialog.locator('.candidate-list').getByRole('button')
  await expect(candidates).toHaveCount(3)
  await candidates.nth(1).click()
  await expect(candidates.nth(1)).toHaveAttribute('aria-pressed', 'true')
  const agendaAddedEvent = page.locator('.day-card .event-detail strong').filter({ hasText: '집중 작업 시간' })
  await expect(agendaAddedEvent).toHaveCount(0)
  await dialog.getByRole('button', { name: '샘플 일정 등록하기' }).click()
  await expect(dialog.getByRole('status')).toContainText('샘플 일정이 화면에 추가됐어요')
  await expect(dialog.getByRole('status')).toContainText('DB에는 저장되지 않으며')
  await expect(agendaAddedEvent).toBeVisible()
  await page.reload()
  await expect(page.locator('.day-card .event-detail strong').filter({ hasText: '집중 작업 시간' })).toHaveCount(0)
})

test('샘플 대화는 Escape로 닫히고 초점을 실행 버튼으로 돌려준다', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) > 600, '모바일 플로팅 버튼 흐름에서 확인합니다.')
  await page.goto('/')
  const launcher = page.getByRole('button', { name: /틈새에게 물어보기/ })
  await launcher.click()
  await expect(page.getByRole('dialog', { name: '틈새 샘플 대화' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '틈새 샘플 대화' })).toBeHidden()
  await expect(launcher).toBeFocused()
})

test('샘플 채팅 마이크 버튼은 로그인 후 음성 명령 안내를 보여준다', async ({ page }) => {
  await page.goto('/')
  if ((page.viewportSize()?.width ?? 1280) <= 600) await page.getByRole('button', { name: /틈새에게 물어보기/ }).click()
  const micButton = page.getByRole('button', { name: '음성 명령 사용 안내' })
  await expect(micButton).toBeVisible()
  const tooltip = page.getByRole('tooltip')
  if ((page.viewportSize()?.width ?? 1280) > 600) {
    await micButton.hover()
    await expect(tooltip).toBeVisible()
  }
  await micButton.click()
  await expect(tooltip).toHaveText('로그인 후 음성 명령을 사용할 수 있어요.')
})
