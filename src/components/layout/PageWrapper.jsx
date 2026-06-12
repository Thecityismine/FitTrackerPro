// src/components/layout/PageWrapper.jsx
import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header'
import BottomNav from './BottomNav'

export default function PageWrapper({
  children,
  showHeader = true,
  showSettings = false,
  headerAction = null,
  showProfileLink = true,
  showBottomNav = true,
  className = '',
}) {
  const mainRef = useRef(null)
  const { key } = useLocation()

  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [key])

  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden">
      {showHeader && <Header showSettings={showSettings} headerAction={headerAction} showProfileLink={showProfileLink} />}
      <main ref={mainRef} className={`flex-1 overflow-y-auto ${showBottomNav ? 'pb-24' : ''} ${className}`}>
        {children}
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  )
}
