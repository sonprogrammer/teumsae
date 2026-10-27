import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '틈새 | 개인 AI 스케줄러',
  description: '등록한 일정을 기준으로 빈 시간을 찾는 개인 스케줄러'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
