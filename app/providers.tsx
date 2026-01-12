'use client'

import { UndoProvider } from '@/lib/undo-context'
import { AppLayout } from './components/AppLayout'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UndoProvider>
      <AppLayout>
        {children}
      </AppLayout>
    </UndoProvider>
  )
}
