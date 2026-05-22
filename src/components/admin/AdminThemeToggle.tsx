'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const STORAGE_KEY = 'heliocap-admin-theme'

type AdminTheme = 'light' | 'dark'

function applyTheme(theme: AdminTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function AdminThemeToggle() {
  const [theme, setTheme] = useState<AdminTheme>('dark')
  const isDark = theme === 'dark'

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    applyTheme('dark')
  }, [])

  const toggleTheme = () => {
    const nextTheme: AdminTheme = isDark ? 'light' : 'dark'
    setTheme(nextTheme)
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="admin-theme-toggle"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
