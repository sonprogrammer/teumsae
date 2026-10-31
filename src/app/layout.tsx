import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  metadataBase: new URL('https://teumsae-blush.vercel.app'),
  title: '틈새 | 나만의 일정 사이, 여유를 찾다',
  description: '내 일정 사이의 여유를 찾고, AI와 함께 일정을 관리하는 개인 스케줄러',
  openGraph: {
    title: '틈새 | 나만의 일정 사이, 여유를 찾다',
    description: '내 일정 사이의 여유를 찾고, AI와 함께 일정을 관리하는 개인 스케줄러',
    siteName: '틈새 (Teumsae)',
    locale: 'ko_KR',
    type: 'website'
  },
  twitter: { card: 'summary_large_image' }
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
