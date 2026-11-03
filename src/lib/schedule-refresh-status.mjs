export function formatScheduleUpdatedAt(timestamp) {
  if (!Number.isFinite(timestamp)) return '확인 전'
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(timestamp))
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${fields.month}월 ${fields.day}일 ${fields.hour}:${fields.minute}`
}
