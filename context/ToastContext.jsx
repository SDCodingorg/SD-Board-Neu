'use client'
import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null)

  const toast = useCallback((text) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 2800)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
