import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-wiz-bg">

      {/* Left Sidebar */}
      <Sidebar />

      {/* Right: Header + Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin bg-wiz-bg isolate">
          {children}
        </main>
      </div>

    </div>
  )
}
