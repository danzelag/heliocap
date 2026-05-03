'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

const leadStatuses = ['published', 'contacted', 'emailed', 'replied', 'booked', 'archived'] as const

export async function updateLeadAction(formData: FormData) {
  const supabase = await createClient()

  const id = formData.get('id') as string
  const business_name = formData.get('business_name') as string
  const contact_name = formData.get('contact_name') as string
  const address = formData.get('address') as string
  const estimated_savings = parseFloat(formData.get('estimated_savings') as string)
  const notes = formData.get('notes') as string
  const status = formData.get('status') as string

  if (!leadStatuses.includes(status as (typeof leadStatuses)[number])) {
    redirect(`/admin/leads/${id}?error=invalid-status`)
  }

  const rawLat = formData.get('lat') as string
  const rawLng = formData.get('lng') as string
  const roof_image_url = (formData.get('roof_image_url') as string) || undefined

  const update: Record<string, unknown> = {
    business_name,
    contact_name,
    address,
    estimated_savings,
    notes,
    status,
  }

  if (rawLat && rawLng) {
    update.lat = parseFloat(rawLat)
    update.lng = parseFloat(rawLng)
  }
  if (roof_image_url) {
    update.roof_image_url = roof_image_url
  }

  const { error } = await supabase
    .from('leads')
    .update(update)
    .eq('id', id)

  if (error) {
    console.error('Error updating lead:', error)
    redirect(`/admin/leads/${id}?error=failed`)
  }

  revalidatePath('/admin')
  redirect('/admin')
}
