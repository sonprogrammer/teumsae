function dateFromISO(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISO(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function shiftMonth(iso: string, offset: number): string {
  const date = dateFromISO(iso)
  return toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)))
}

export function monthGrid(iso: string): string[] {
  const date = dateFromISO(iso)
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  first.setUTCDate(first.getUTCDate() - mondayOffset)
  const dates: string[] = []
  while (first <= last || first.getUTCDay() !== 1) {
    dates.push(toISO(first))
    first.setUTCDate(first.getUTCDate() + 1)
  }
  return dates
}
