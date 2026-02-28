// src/components/layout/PageWrapper.jsx
import Header from './Header'
import BottomNav from './BottomNav'

export default function PageWrapper({ children, showHeader = true, showSettings = false, className = '' }) {
  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden">
      {showHeader && <Header showSettings={showSettings} />}
      <main className={`flex-1 overflow-y-auto pb-24 ${className}`}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
