// src/components/layout/PageWrapper.jsx
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
  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden">
      {showHeader && <Header showSettings={showSettings} headerAction={headerAction} showProfileLink={showProfileLink} />}
      <main className={`flex-1 overflow-y-auto ${showBottomNav ? 'pb-24' : ''} ${className}`}>
        {children}
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  )
}
