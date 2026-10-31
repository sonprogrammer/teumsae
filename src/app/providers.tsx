'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '@/lib/query-client'
import { ScheduleUiProvider } from '@/stores/schedule-ui-store'
import PwaRuntime from '@/components/pwa-runtime'

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return <QueryClientProvider client={queryClient}><ScheduleUiProvider><PwaRuntime />{children}</ScheduleUiProvider></QueryClientProvider>
}
