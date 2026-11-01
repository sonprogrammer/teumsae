'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react'
import AvailabilitySettings from '@/components/availability-settings'
import PushReminderSettings from '@/components/push-reminder-settings'

type SettingsCategory = 'weekly' | 'exceptions' | 'reminders'

const categories = [
  { id: 'weekly' as const, label: '요일별 가능 시간', description: '일정 추천을 받을 요일과 시간', Icon: CalendarDays },
  { id: 'exceptions' as const, label: '일정 불가일', description: '휴가나 하루 종일 쉬는 날', Icon: CalendarOff },
  { id: 'reminders' as const, label: '알림', description: '일정 시작 전 푸시 알림', Icon: Bell }
]

export default function SettingsNavigation({ userId }: { userId: string }) {
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const navigationHeading = useRef<HTMLHeadingElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const previousDetailOpen = useRef(false)
  const selectedItem = categories.find(category => category.id === selectedCategory)

  useEffect(() => {
    if (selectedCategory && detailOpen) detailHeading.current?.focus()
    else if (previousDetailOpen.current && !detailOpen) navigationHeading.current?.focus()
    previousDetailOpen.current = detailOpen
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
      {selectedItem ? <header className="settings-detail-heading">
        <button type="button" className="settings-back-button" aria-label="설정 목록으로 돌아가기" onClick={() => { setSelectedCategory(null); setDetailOpen(false) }}><ChevronLeft aria-hidden="true" /><span>설정 목록</span></button>
        <div className="settings-detail-copy"><h2 ref={detailHeading} tabIndex={-1}>{selectedItem.label}</h2><p>{selectedItem.description}</p></div>
      </header> : <div className="settings-empty-state"><CalendarDays aria-hidden="true" /><p>관리할 설정을 선택해 주세요.</p></div>}
      <section id="settings-panel-weekly" className="settings-detail-panel" aria-label="요일별 가능 시간" hidden={selectedCategory !== 'weekly'}>
        <AvailabilitySettings userId={userId} mode="weekly" />
      </section>
      <section id="settings-panel-exceptions" className="settings-detail-panel" aria-label="일정 불가일" hidden={selectedCategory !== 'exceptions'}>
        <AvailabilitySettings userId={userId} mode="exceptions" />
      </section>
      <section id="settings-panel-reminders" className="settings-detail-panel" aria-label="알림" hidden={selectedCategory !== 'reminders'}>
        <PushReminderSettings userId={userId} />
      </section>
    </div>
  </div>
}
