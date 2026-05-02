import { createAdminClient } from '@/lib/supabase-server'
import type { Prospect } from '@/lib/prospect'

export class ProspectService {
  static async listProspects(): Promise<Prospect[]> {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error listing prospects:', error)
      return []
    }

    return (data || []) as Prospect[]
  }
}
