import ScheduleDemo from '@/components/schedule-demo'

export const dynamic = 'force-dynamic'

export default function Home() {
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

  return <ScheduleDemo today={today} />
}
