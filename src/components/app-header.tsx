import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type AppHeaderProps = {
  brandHref?: string
  children: ReactNode
  variant: 'sample' | 'account'
}

export default function AppHeader({ brandHref, children, variant }: AppHeaderProps) {
  const isSample = variant === 'sample'
  const headerClassName = isSample ? 'site-header' : 'real-schedule-header'
  const brandClassName = isSample ? 'brand' : 'real-schedule-brand'
  const actionsClassName = isSample ? 'header-right' : 'real-header-actions'

  const brand = (
    <>
      <Image
        src="/teumsae-logo.png"
        alt=""
        width={isSample ? 52 : 48}
        height={isSample ? 44 : 40}
        priority
      />
      <span>
        틈새
        {isSample ? (
          <span className="brand-latin">TEUMSAE</span>
        ) : (
          <small>TEUMSAE</small>
        )}
      </span>
    </>
  )

  return (
    <header className={headerClassName}>
      {brandHref ? (
        <Link href={brandHref} className={brandClassName}>
          {brand}
        </Link>
      ) : (
        <div className={brandClassName} aria-label="틈새">
          {brand}
        </div>
      )}
      <div className={actionsClassName}>
        {children}
      </div>
    </header>
  )
}
