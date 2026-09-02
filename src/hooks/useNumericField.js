// src/hooks/useNumericField.js
import { useEffect, useRef, useState } from 'react'
import { toInputValue } from '../utils/sessionHistory'

const NUMERIC_TEXT = /^\d*\.?\d*$/

/**
 * Controlled numeric input backed by a string buffer.
 *
 * Two things the raw `value={set.weight}` inputs got wrong:
 *
 * 1. The buffer keeps intermediate text ("", "12.", "0") typeable without the
 *    parsed number fighting the keystroke.
 * 2. The echo guard means only a change that did NOT originate here - a reload,
 *    a save writing back an older snapshot, an edit to the row from somewhere
 *    else - replaces what is on screen. The previous rows seeded local state
 *    once and never resynced, so the box could keep showing a number that had
 *    already been reverted underneath it.
 *
 * `onCommit` receives the parsed number only; the caller merges it into the
 * authoritative set, so editing reps can never carry a stale weight along.
 */
export default function useNumericField(value, onCommit) {
  const [text, setText] = useState(() => toInputValue(value))
  const committedRef = useRef(value)

  useEffect(() => {
    if (committedRef.current === value) return
    committedRef.current = value
    setText(toInputValue(value))
  }, [value])

  function onChange(event) {
    const raw = event.target.value
    if (raw !== '' && !NUMERIC_TEXT.test(raw)) return
    setText(raw)
    const parsed = raw === '' ? 0 : parseFloat(raw)
    const next = Number.isFinite(parsed) ? parsed : 0
    committedRef.current = next
    onCommit(next)
  }

  return { value: text, onChange }
}
