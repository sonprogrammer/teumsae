export type SampleSlot = { start: string; end: string }
export type ScheduleInterval = { date: string; start: string; end: string }

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function findSampleSlots(events: ScheduleInterval[], date: string): SampleSlot[] {
  const slots: SampleSlot[] = []
  for (let start = 13 * 60; start + 60 <= 18 * 60 && slots.length < 3; start += 60) {
    const end = start + 60
    const occupied = events.some(event => event.date === date && toMinutes(event.start) < end && toMinutes(event.end) > start)
    if (!occupied) slots.push({ start: toTime(start), end: toTime(end) })
  }
  return slots
}
