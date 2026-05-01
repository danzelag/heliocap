'use server'

import { createAdminClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function deleteLeadsAction(ids: string[]) {
  const leadIds = ids.filter(Boolean)

  if (leadIds.length === 0) {
    throw new Error('No lead IDs were provided')
  }

  const supabase = await createAdminClient()
  
  const { data, error } = await supabase
    .from('leads')
    .delete()
    .in('id', leadIds)
    .select('id, slug')

  if (error) {
    console.error('Failed to delete leads:', error)
    throw new Error(error.message || 'Failed to delete leads')
  }

  revalidatePath('/admin')
  data?.forEach((lead) => {
    if (lead.slug) revalidatePath(`/proposal/${lead.slug}`)
  })

  return { success: true, deleted: data?.length ?? 0 }
}

export async function updateLeadsStatusAction(ids: string[], status: 'draft' | 'published' | 'archived') {
  const supabase = await createAdminClient()

  const { error } = await supabase
    .from('leads')
    .update({ status })
    .in('id', ids)

  if (error) {
    throw new Error('Failed to update status')
  }

  revalidatePath('/admin')
  return { success: true }
}
