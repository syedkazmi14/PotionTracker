import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Map, Menu, X, Wand2, Activity } from 'lucide-react'
import { useState } from 'react'
import { DateTime } from 'luxon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function MainLayout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const lastUpdate = DateTime.now().toLocaleString(DateTime.TIME_WITH_SECONDS)
  const isWitchView = location.pathname === '/witch-view'

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/map', label: 'Map', icon: Map },
    { path: '/live-data', label: 'Live Data', icon: Activity },
    { path: '/witch-view', label: 'Witch View', icon: Wand2 },
  ]

  return (
    <div className={cn("min-h-screen", isWitchView ? "bg-green-50" : "bg-background")}>
      {/* Topbar */}
      <header className={cn(
        "sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60",
        isWitchView 
          ? "bg-green-50/95 border-green-200" 
          : "bg-background/95"
      )}>
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X /> : <Menu />}
            </Button>
            <div className="flex items-center gap-2">
            <span className={cn("text-2xl", isWitchView ? "text-green-600" : "text-indigo-500")}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.5 3.798v5.02a3 3 0 0 1-.879 2.121l-2.377 2.377a9.845 9.845 0 0 1 5.091 1.013 8.315 8.315 0 0 0 5.713.636l.285-.071-3.954-3.955a3 3 0 0 1-.879-2.121v-5.02a23.614 23.614 0 0 0-3 0Zm4.5.138a.75.75 0 0 0 .093-1.495A24.837 24.837 0 0 0 12 2.25a25.048 25.048 0 0 0-3.093.191A.75.75 0 0 0 9 3.936v4.882a1.5 1.5 0 0 1-.44 1.06l-6.293 6.294c-1.62 1.621-.903 4.475 1.471 4.88 2.686.46 5.447.698 8.262.698 2.816 0 5.576-.239 8.262-.697 2.373-.406 3.092-3.26 1.47-4.881L15.44 9.879A1.5 1.5 0 0 1 15 8.818V3.936Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <h1 className={cn("text-xl font-bold", isWitchView && "text-green-800")}>CauldronWatch</h1>
            </div>
          </div>
          <div className={cn("text-sm", isWitchView ? "text-green-700" : "text-muted-foreground")}>
            Last update: {lastUpdate}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 border-r pt-16 transition-transform md:translate-x-0",
            isWitchView ? "bg-green-50 border-green-200" : "bg-background",
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              const isWitchItem = item.path === '/witch-view'
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? isWitchItem
                        ? "bg-green-100 text-green-900"
                        : "bg-accent text-accent-foreground"
                      : isWitchItem && isWitchView
                      ? "text-green-700 hover:bg-green-100"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 md:ml-64">
          <div className="container p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

