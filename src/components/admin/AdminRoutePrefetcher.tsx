'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const warmRoutes = ['/admin', '/admin/pipeline', '/admin/leads/new']

export function AdminRoutePrefetcher() {
  const router = useRouter()

  useEffect(() => {
    warmRoutes.forEach((route) => router.prefetch(route))
  }, [router])

  return null
}
