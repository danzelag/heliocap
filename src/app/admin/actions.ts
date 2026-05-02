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
    
    // 1. Fetch slugs first so we know which storage folders and paths to clear
    const { data: leadsToDestroy, error: fetchError } = await supabase
      .from('leads')
      .select('slug')
      .in('id', leadIds)

    if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`)

    // 2. Clear assets from Supabase Storage for each lead
    if (leadsToDestroy && leadsToDestroy.length > 0) {
      for (const lead of leadsToDestroy) {
        if (!lead.slug) continue

        // List files in the folder (slug) and delete them
        const { data: files } = await supabase.storage.from('leads').list(lead.slug)
        if (files && files.length > 0) {
          const pathsToDelete = files.map((f) => `${lead.slug}/${f.name}`)
          await supabase.storage.from('leads').remove(pathsToDelete)
        }
      }
    }

    // 3. Delete the records from the database
    const { data, error: deleteError } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)
      .select('id, slug')

    if (deleteError) {
      console.error('[deleteLeadsAction] DB Error:', deleteError)
      return { success: false, error: `Database lock: ${deleteError.message}` }
    }

    // 4. Purge Next.js Cache (The 'Actual Page' removal)
    revalidatePath('/admin')
    revalidatePath('/admin/leads')
    if (data) {
      data.forEach((l) => {
        if (l.slug) revalidatePath(`/proposal/${l.slug}`)
      })
    }

    return { success: true, deleted: data?.length ?? 0 }
  } catch (error) {
    console.error('[deleteLeadsAction] Hard Wipe Failure:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Deep wipe failed' 
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
