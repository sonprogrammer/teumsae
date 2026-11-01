'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import AvailabilitySettings from '@/components/availability-settings'
import PushReminderSettings from '@/components/push-reminder-settings'

type SettingsCategory = 'availability' | 'reminders'

const categories = [
  { id: 'availability' as const, label: '일정 추천', description: '요일별 가능 시간과 일정 불가일', Icon: CalendarDays },
  { id: 'reminders' as const, label: '알림', description: '일정 시작 전 푸시 알림', Icon: Bell }
]

export default function SettingsNavigation({ userId }: { userId: string }) {
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>('availability')
  const [detailOpen, setDetailOpen] = useState(false)
  const navigationHeading = useRef<HTMLHeadingElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const selectedItem = categories.find(category => category.id === selectedCategory) ?? categories[0]

  useEffect(() => {
    if (detailOpen) detailHeading.current?.focus()
    else navigationHeading.current?.focus()
  }, [detailOpen, selectedCategory])

  return <div className={'settings-layout' + (detailOpen ? ' is-detail-open' : '')}>
    <nav className={'settings-category-nav' + (detailOpen ? ' is-detail-hidden' : '')} aria-label="설정 항목">
      <h2 className="settings-category-nav-heading" ref={navigationHeading} tabIndex={-1}>설정 항목</h2>
      <div className="settings-category-list">
        {categories.map(({ id, label, description, Icon }) => <button type="button" className={'settings-category-button' + (selectedCategory === id ? ' is-selected' : '')} key={id} aria-current={selectedCategory === id ? 'page' : undefined} aria-controls={'settings-panel-' + id} onClick={() => { setSelectedCategory(id); setDetailOpen(true) }}>
          <span className="settings-category-icon"><Icon aria-hidden="true" /></span>
          <span className="settings-category-copy"><strong>{label}</strong><small>{description}</small></span>
          <ChevronRight className="settings-category-chevron" aria-hidden="true" />
        </button>)}
      </div>
    </nav>
    <div className={'settings-details' + (detailOpen ? ' is-detail-open' : '')}>
      <header className="settings-detail-heading">
        <button type="button" className="settings-mobile-back" aria-label="설정 목록으로 돌아가기" onClick={() => setDetailOpen(false)}><ChevronLeft aria-hidden="true" /><span>설정 목록</span></button>
        <p className="section-kicker">{selectedCategory === 'availability' ? 'SCHEDULE PREFERENCES' : 'NOTIFICATIONS'}</p>
        <h2 ref={detailHeading} tabIndex={-1}>{selectedItem.label}</h2>
        <p>{selectedItem.description}</p>
      </header>
      <section id="settings-panel-availability" className="settings-detail-panel" aria-label="일정 추천" hidden={selectedCategory !== 'availability'}>
        <AvailabilitySettings userId={userId} />
      </section>
      <section id="settings-panel-reminders" className="settings-detail-panel" aria-label="알림" hidden={selectedCategory !== 'reminders'}>
        <PushReminderSettings userId={userId} />
      </section>
    </div>
  </div>
}
