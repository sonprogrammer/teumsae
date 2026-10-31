import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '틈새 (Teumsae)',
    short_name: '틈새',
    description: '내 일정 사이의 여유를 찾고, AI와 함께 일정을 관리하는 개인 스케줄러',
    start_url: '/schedule',
    display: 'standalone',
    background_color: '#f8f7f1',
    theme_color: '#147d70',
    lang: 'ko-KR',
    icons: [
      { src: '/teumsae-app-icon.png', sizes: '1254x1254', type: 'image/png', purpose: 'any' },
      { src: '/teumsae-app-icon.png', sizes: '1254x1254', type: 'image/png', purpose: 'maskable' }
    ]
  }
}
