'use server'

import { createAdminClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function deleteLeadsAction(ids: string[]) {
  const supabase = await createAdminClient()
  
  const { error } = await supabase
    .from('leads')
    .delete()
    .in('id', ids)

  if (error) {
    throw new Error('Failed to delete leads')
  }

  revalidatePath('/admin')
  return { success: true }
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
