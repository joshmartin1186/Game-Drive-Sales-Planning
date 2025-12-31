'use client'

import { UndoProvider } from '@/lib/undo-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UndoProvider>
      {children}
    </UndoProvider>
  )
}
