'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const warmRoutes = ['/admin', '/admin/pipeline', '/admin/leads/new']
const PREFETCH_INTERVAL_MS = 30_000

export function AdminRoutePrefetcher() {
  const router = useRouter()

  useEffect(() => {
    const prefetchAdminRoutes = () => {
      warmRoutes.forEach((route) => router.prefetch(route))
    }

    prefetchAdminRoutes()
    const interval = window.setInterval(prefetchAdminRoutes, PREFETCH_INTERVAL_MS)
    window.addEventListener('focus', prefetchAdminRoutes)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', prefetchAdminRoutes)
    }
  }, [router])

  return null
}
