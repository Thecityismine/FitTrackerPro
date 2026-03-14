// src/context/TimerContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'

const TimerContext = createContext(null)

export function TimerProvider({ children }) {
  // `base` = accumulated seconds before the current run started
  const [base, setBase] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [display, setDisplay] = useState(0)
  const startedAtRef = useRef(null) // Date.now() when current run began
  const intervalRef = useRef(null)
  const baseRef = useRef(0)

  useEffect(() => { baseRef.current = base }, [base])

  function tick() {
    if (startedAtRef.current == null) return
    const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
    setDisplay(baseRef.current + elapsed)
  }

  useEffect(() => {
    if (isRunning) {
      startedAtRef.current = Date.now()
      intervalRef.current = setInterval(tick, 500)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  // Re-sync when tab/app comes back to foreground
  useEffect(() => {
    function onVisible() {
      if (isRunning) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  const start = () => setIsRunning(true)

  const pause = () => {
    if (!isRunning) return
    const elapsed = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current) / 1000)
      : 0
    const frozen = baseRef.current + elapsed
    setBase(frozen)
    baseRef.current = frozen
    setDisplay(frozen)
    setIsRunning(false)
  }

  const toggle = () => {
    if (isRunning) pause()
    else start()
  }

  const reset = () => {
    clearInterval(intervalRef.current)
    startedAtRef.current = null
    setIsRunning(false)
    setBase(0)
    baseRef.current = 0
    setDisplay(0)
  }

  const seconds = display

  const formatted = () => {
    const m = Math.floor(display / 60).toString().padStart(2, '0')
    const s = (display % 60).toString().padStart(2, '0')
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
