import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const alt = '틈새, 나만의 일정 사이 여유를 찾다'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const backgroundData = await readFile(join(process.cwd(), 'public', 'teumsae-og.png'), 'base64')
const logoData = await readFile(join(process.cwd(), 'public', 'teumsae-logo.png'), 'base64')
const backgroundSrc = 'data:image/png;base64,' + backgroundData
const logoSrc = 'data:image/png;base64,' + logoData

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: 'flex', position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <img src={backgroundSrc} alt="" style={{ position: 'absolute', inset: 0, width: 1200, height: 630, objectFit: 'cover' }} />
      <div style={{ display: 'flex', position: 'absolute', top: 45, left: 52, alignItems: 'center', gap: 13, padding: '9px 17px 9px 9px', border: '1px solid #e5e6d9', borderRadius: 999, background: '#fffefaed' }}>
        <img src={logoSrc} alt="" style={{ width: 68, height: 46, objectFit: 'contain' }} />
        <span style={{ color: '#183934', fontSize: 20, fontWeight: 800, letterSpacing: '0.15em' }}>TEUMSAE</span>
      </div>
    </div>,
    size
  )
}
