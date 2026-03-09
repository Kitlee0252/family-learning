import { createContext, useContext, useState, useCallback, useRef } from 'react'
import styles from './Toast.module.css'

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)

  const showToast = useCallback((text) => {
    clearTimeout(timer.current)
    setMsg(text)
    setVisible(true)
    timer.current = setTimeout(() => setVisible(false), 2000)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`${styles.toast} ${visible ? styles.show : ''}`}>{msg}</div>
    </ToastContext.Provider>
  )
}
