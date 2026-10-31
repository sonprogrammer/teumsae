import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const appIconData = await readFile(join(process.cwd(), 'public', 'teumsae-app-icon.png'), 'base64')
const appIconSrc = 'data:image/png;base64,' + appIconData

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <img src={appIconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>,
    size
  )
}
