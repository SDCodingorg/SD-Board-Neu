'use client'
import { SessionProvider as NextSessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/context/ThemeContext'
import { ToastProvider } from '@/context/ToastContext'

export default function SessionProvider({ children, session }) {
  return (
    <NextSessionProvider session={session}>
      <ThemeProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </ThemeProvider>
    </NextSessionProvider>
  )
}
