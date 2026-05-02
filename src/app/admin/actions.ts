'use server'

import { createAdminClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function deleteLeadsAction(ids: string[]) {
  const leadIds = ids.filter(Boolean)

  if (leadIds.length === 0) {
    return { success: false, error: 'No lead IDs provided' }
  }

  try {
    const supabase = await createAdminClient()
    
    const { data, error } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)
      .select('id, slug')

    if (error) {
      console.error('[deleteLeadsAction] Supabase error:', error)
      return { success: false, error: `Database error: ${error.message}` }
    }

    // Revalidate paths to clear cache
    revalidatePath('/admin')
    revalidatePath('/admin/leads')
    
    if (data && data.length > 0) {
      data.forEach((lead) => {
        if (lead.slug) revalidatePath(`/proposal/${lead.slug}`)
      })
    }

    return { success: true, deleted: data?.length ?? 0 }
  } catch (error) {
    console.error('[deleteLeadsAction] Critical failure:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'A critical server error occurred' 
    }
  }
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
