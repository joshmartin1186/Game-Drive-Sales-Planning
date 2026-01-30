'use client'

import { UndoProvider } from '@/lib/undo-context'
import { AuthProvider } from '@/lib/auth-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UndoProvider>
        {children}
      </UndoProvider>
    </AuthProvider>
  )
}
