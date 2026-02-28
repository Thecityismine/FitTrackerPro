// src/context/TimerContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'

const TimerContext = createContext(null)

export function TimerProvider({ children }) {
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1)
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isRunning])

  const start = () => setIsRunning(true)
  const pause = () => setIsRunning(false)
  const toggle = () => setIsRunning((r) => !r)
  const reset = () => {
    setIsRunning(false)
    setSeconds(0)
  }

  const formatted = () => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <TimerContext.Provider value={{ seconds, isRunning, start, pause, toggle, reset, formatted }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimer must be used within TimerProvider')
  return ctx
}
