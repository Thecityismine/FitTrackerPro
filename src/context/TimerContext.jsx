// src/context/TimerContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'

const TimerContext = createContext(null)
const STORAGE_KEY = 'fittrack-rest-timer-v1'

function getStoredTimerState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return {
      base: Number.isFinite(parsed?.base) ? parsed.base : 0,
      isRunning: Boolean(parsed?.isRunning),
      startedAt: Number.isFinite(parsed?.startedAt) ? parsed.startedAt : null,
    }
  } catch {
    return { base: 0, isRunning: false, startedAt: null }
  }
}

function getDisplayValue(base, startedAt, isRunning) {
  if (!isRunning || !startedAt) return base
  return base + Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}

export function TimerProvider({ children }) {
  const initialTimerState = getStoredTimerState()
  // `base` = accumulated seconds before the current run started
  const [base, setBase] = useState(initialTimerState.base)
  const [isRunning, setIsRunning] = useState(initialTimerState.isRunning)
  const [display, setDisplay] = useState(() => getDisplayValue(initialTimerState.base, initialTimerState.startedAt, initialTimerState.isRunning))
  const startedAtRef = useRef(initialTimerState.startedAt) // Date.now() when current run began
  const intervalRef = useRef(null)
  const baseRef = useRef(initialTimerState.base)

  useEffect(() => { baseRef.current = base }, [base])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      base,
      isRunning,
      startedAt: startedAtRef.current,
    }))
  }, [base, isRunning])

  function tick() {
    setDisplay(getDisplayValue(baseRef.current, startedAtRef.current, isRunning))
  }

  useEffect(() => {
    if (isRunning) {
      if (startedAtRef.current == null) startedAtRef.current = Date.now()
      tick()
      intervalRef.current = setInterval(tick, 500)
    } else {
      clearInterval(intervalRef.current)
      setDisplay(baseRef.current)
    }
    return () => clearInterval(intervalRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  // Re-sync when tab/app comes back to foreground
  useEffect(() => {
    function syncVisibleState() {
      if (isRunning) tick()
    }
    document.addEventListener('visibilitychange', syncVisibleState)
    window.addEventListener('focus', syncVisibleState)
    window.addEventListener('pageshow', syncVisibleState)
    return () => {
      document.removeEventListener('visibilitychange', syncVisibleState)
      window.removeEventListener('focus', syncVisibleState)
      window.removeEventListener('pageshow', syncVisibleState)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  const start = () => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now()
    setIsRunning(true)
  }

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
