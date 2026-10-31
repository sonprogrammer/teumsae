import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

const logoData = await readFile(join(process.cwd(), 'public', 'teumsae-logo.png'), 'base64')
const logoSrc = 'data:image/png;base64,' + logoData

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#e7f4ed' }}>
      <img src={logoSrc} alt="" style={{ width: 400, height: 267, objectFit: 'contain' }} />
    </div>,
    size
  )
}
