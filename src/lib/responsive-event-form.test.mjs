import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import postcss from 'postcss'

const stylesheet = postcss.parse(await readFile(new URL('../app/globals.css', import.meta.url), 'utf8'))

function declarationsForSelector(selector, mediaCondition) {
  const declarations = {}
  const collect = root => root.walkRules(selector, rule => rule.walkDecls(declaration => {
    declarations[declaration.prop] = declaration.value
  }))

  if (!mediaCondition) {
    collect(stylesheet)
    return declarations
  }

  stylesheet.walkAtRules('media', rule => {
    if (rule.params !== mediaCondition) return
    collect(rule)
  })
  return declarations
}

function declarationsForBaseSelector(selector) {
  const declarations = {}
  stylesheet.walkRules(selector, rule => {
    let parent = rule.parent
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule') return
      parent = parent.parent
    }
    rule.walkDecls(declaration => {
      declarations[declaration.prop] = declaration.value
    })
  })
  return declarations
}

test('lets the edit form use the full event card width', () => {
  const declarations = declarationsForSelector('.real-event-form')
  assert.equal(declarations['grid-column'], '1 / -1')
})

test('stacks date and time controls on narrow mobile viewports', () => {
  const declarations = declarationsForSelector('.real-datetime-fields', '(max-width: 480px)')
  assert.equal(declarations['grid-template-columns'], 'minmax(0, 1fr)')
})

test('stacks the calendar and agenda when the viewport cannot fit both panels', () => {
  const declarations = declarationsForSelector('.real-schedule-workspace', '(max-width: 1200px)')
  assert.equal(declarations['grid-template-columns'], 'minmax(0, 1fr)')
})

test('centers a wider two-column schedule layout on desktop', () => {
  assert.equal(declarationsForBaseSelector('.real-schedule-content')['max-width'], '1500px')
  assert.equal(declarationsForBaseSelector('.real-schedule-header')['max-width'], '1500px')
  assert.equal(declarationsForBaseSelector('.real-schedule-workspace')['grid-template-columns'], 'minmax(0, 1.7fr) minmax(340px, .9fr)')
})

test('hides the AI launcher during manual schedule creation with an accessible fade transition', async () => {
  const schedule = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')
  const assistant = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  const hiddenLauncher = declarationsForBaseSelector('.assistant-live-launcher.is-context-hidden')
  assert.match(schedule, /<AssistantPanel userId=\{userId\} hideLauncher=\{creating\} \/>/)
  assert.match(assistant, /hideLauncher = false/)
  assert.match(assistant, /aria-hidden=\{hideLauncher\}/)
  assert.match(assistant, /tabIndex=\{hideLauncher \? -1 : undefined\}/)
  assert.equal(hiddenLauncher['opacity'], '0')
  assert.equal(hiddenLauncher['visibility'], 'hidden')
  assert.equal(hiddenLauncher['pointer-events'], 'none')
  assert.match(hiddenLauncher['transition-delay'], /180ms/)
})

test('uses the provided Teumsae AI artwork in the floating launcher', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /src="\/teumsaeAI\.png"/)
  assert.match(source, /alt=""/)
})

test('keeps the launcher label close to the artwork despite its transparent padding', () => {
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['gap'], '3px')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher img')['margin-left'], '-14px')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher img')['margin-right'], '-14px')
})

test('keeps the desktop AI conversation collapsed beside a persistent floating launcher', () => {
  const panel = declarationsForBaseSelector('.assistant-live-panel')
  const openPanel = declarationsForBaseSelector('.assistant-live-panel.is-open')
  assert.equal(panel['position'], 'fixed')
  assert.equal(panel['visibility'], 'hidden')
  assert.equal(panel['transform-origin'], 'bottom right')
  assert.equal(openPanel['visibility'], 'visible')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['position'], 'fixed')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['display'], 'flex')
})

test('opens the mobile AI panel as an animated bottom sheet with a dismissible backdrop', () => {
  const panel = declarationsForSelector('.assistant-live-panel', '(max-width: 700px)')
  const openPanel = declarationsForSelector('.assistant-live-panel.is-open', '(max-width: 700px)')
  assert.equal(panel['transform'], 'translate3d(0, 100%, 0)')
  assert.equal(openPanel['transform'], 'translate3d(0, 0, 0)')
  assert.equal(declarationsForSelector('.assistant-live-backdrop', '(max-width: 700px)')['display'], 'block')
  assert.equal(declarationsForBaseSelector('.assistant-live-panel')['visibility'], 'hidden')
  assert.equal(declarationsForBaseSelector('.assistant-live-panel.is-open')['visibility'], 'visible')
  assert.equal(declarationsForBaseSelector('.assistant-live-launcher')['display'], 'flex')
})

test('closes the AI panel when clicking outside it', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /!panelRef\.current\?\.contains\(target\)/)
  assert.match(source, /document\.addEventListener\('pointerdown', closeOnOutsideClick\)/)
  assert.match(source, /document\.removeEventListener\('pointerdown', closeOnOutsideClick\)/)
})

test('keeps the AI textarea at a fixed height without manual resizing', () => {
  const input = declarationsForBaseSelector('.assistant-live-form textarea')
  assert.equal(input['height'], '54px')
  assert.equal(input['resize'], 'none')
})

test('restores the recent assistant conversation through the user-scoped query cache', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /useQuery\(/)
  assert.match(source, /assistantConversationQueryKeys\.recent\(userId\)/)
  assert.match(source, /recentConversationQuery\.data\?\.conversation/)
  assert.match(source, /recentConversationQuery\.refetch\(\)/)
  assert.match(source, /최근 대화를 불러오는 중/)
  assert.match(source, /최근 대화를 불러오지 못했어요/)
})

test('shows Korean message times, day dividers and authoritative registration recovery states', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /formatTranscriptTime\(message\.createdAt\)/)
  assert.match(source, /formatTranscriptDay\(message\.createdAt/)
  assert.match(source, /assistant-live-date-divider/)
  assert.match(source, /일정에 추가됨/)
  assert.match(source, /아직 저장되지 않았어요/)
  assert.match(source, /이 내용으로 다시 제안/)
  assert.match(source, /onProposalRetry/)
})

test('suggests checking availability settings when no free intervals or candidates exist', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /해당 날짜가 불가일로 설정됐는지 확인해 주세요/)
  assert.equal((source.match(/<AvailabilityEmptyState \/>/g) ?? []).length, 2)
})

test('shows candidates three at a time without another request', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /visibleCandidateCount, setVisibleCandidateCount\] = useState\(3\)/)
  assert.match(source, /candidates\.slice\(0, visibleCandidateCount\)/)
  assert.match(source, /setVisibleCandidateCount\(current => current \+ 3\)/)
  assert.match(source, /후보 \{Math\.min\(3, result\.candidates\.length - visibleCandidateCount\)\}개 더 보기/)
})

test('uses Lucide icons for microphone, spoken replies, and stopping speech', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /from 'lucide-react'/)
  assert.match(source, /<Mic\b/)
  assert.match(source, /<Volume2\b/)
  assert.match(source, /<VolumeX\b/)
  assert.match(source, /음성 답변 중지/)
  assert.doesNotMatch(source, /🎙|◖/)
})

test('shows a refresh indicator while keeping previously loaded schedules visible', async () => {
  const source = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')
  assert.match(source, /eventsQuery\.isFetching && eventsQuery\.data !== undefined/)
  assert.match(source, /className="real-refresh-indicator"/)
  assert.match(source, /role="status" aria-label="일정을 다시 불러오는 중"/)
  assert.match(source, /events\.filter\(event => koreaDateKey\(event\.starts_at\) === date\)/)
})

test('hides the duplicate add action while the inline event form is open', async () => {
  const source = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')
  assert.match(source, /!creating && <button type="button" className="real-primary-button" onClick=\{\(\) => openCreate\(selectedDate\)\}/)
  assert.match(source, /className="real-event-form" action=\{formAction\}/)
})

test('highlights the full schedule card for pointer and keyboard focus', () => {
  assert.ok(declarationsForBaseSelector('.real-event-card:hover')['background'])
  assert.ok(declarationsForBaseSelector('.real-event-card:focus-within')['outline'])
})

test('uses accessible Lucide icon buttons for event editing and deletion', async () => {
  const source = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')
  const actionButton = declarationsForBaseSelector('.real-event-action-button')
  assert.match(source, /from 'lucide-react'/)
  assert.match(source, /<Pencil\b/)
  assert.match(source, /<Trash2\b/)
  assert.match(source, /aria-label="일정 수정"/)
  assert.match(source, /aria-label=\{state\.status === 'success' \? '삭제 완료' : '일정 삭제 확인'\}/)
  assert.equal(actionButton['width'], '40px')
  assert.equal(actionButton['height'], '40px')
})

test('reduces motion for schedule refresh and inline form transitions', () => {
  const refresh = declarationsForSelector('.real-refresh-indicator::after', '(prefers-reduced-motion: reduce)')
  const form = declarationsForSelector('.real-event-form', '(prefers-reduced-motion: reduce)')
  assert.equal(refresh['animation-duration'], '.01ms')
  assert.equal(form['animation-duration'], '.01ms')
})

test('provides loading, retry and background refresh states for availability settings', async () => {
  const source = await readFile(new URL('../components/availability-settings.tsx', import.meta.url), 'utf8')
  assert.match(source, /availability-settings-skeleton/)
  assert.match(source, /settingsQuery\.isFetching && settingsQuery\.data !== undefined/)
  assert.match(source, /이전 설정을 표시하고 있어요/)
  assert.match(source, /settingsQuery\.refetch\(\)/)
})

test('shows a retryable loading error for push reminder settings', async () => {
  const source = await readFile(new URL('../components/push-reminder-settings.tsx', import.meta.url), 'utf8')
  assert.match(source, /className="push-reminder-skeleton"/)
  assert.match(source, /알림 설정을 불러오지 못했어요/)
  assert.match(source, /다시 시도/)
})

test('shows the Teumsae logo beside the assistant title', async () => {
  const source = await readFile(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
  assert.match(source, /<Image className="assistant-live-logo" src="\/teumsae-app-icon\.png" alt="" width=\{36\} height=\{36\}/)
  assert.match(source, /className="assistant-live-logo"/)
})
