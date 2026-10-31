import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const logoData = await readFile(join(process.cwd(), 'public', 'teumsae-logo.png'), 'base64')
const logoSrc = 'data:image/png;base64,' + logoData

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#e7f4ed' }}>
      <img src={logoSrc} alt="" style={{ width: 162, height: 108, objectFit: 'contain' }} />
    </div>,
    size
  )
}
