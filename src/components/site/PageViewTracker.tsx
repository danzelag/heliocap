'use client'

import { useEffect } from 'react'

export function PageViewTracker({ leadId, slug }: { leadId: string; slug: string }) {
  useEffect(() => {
    fetch('/api/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, slug }),
    }).catch(() => {})
  }, [leadId, slug])

  return null
}
