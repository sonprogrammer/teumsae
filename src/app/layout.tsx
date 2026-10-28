import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: '틈새 | 일정 샘플 데모',
  description: '샘플 일정으로 빈 시간 검색과 등록 확인 흐름을 체험하는 화면'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
