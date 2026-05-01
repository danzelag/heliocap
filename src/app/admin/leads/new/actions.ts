'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { LeadService } from '@/services/lead.service'

export async function createLeadAction(formData: FormData) {
  const supabase = await createClient()
  
  const business_name = formData.get('business_name') as string
  const contact_name = formData.get('contact_name') as string
  const address = formData.get('address') as string
  const roof_sqft = parseFloat(formData.get('roof_sqft') as string)
  const utility_rate = parseFloat(formData.get('utility_rate') as string)
  const notes = formData.get('notes') as string
  
  // AI-Powered Estimation
  const { savings, payback } = LeadService.calculateEstimation(roof_sqft, utility_rate)
  
  // Auto-generate slug
  const slug = LeadService.generateSlug(business_name)

  const { data: lead, error } = await supabase
    .from('leads')
    .insert([
      {
        business_name,
        contact_name,
        address,
        slug,
        roof_sqft,
        utility_rate,
        estimated_savings: savings,
        estimated_payback: payback,
        notes,
        status: 'published'
      }
    ])
    .select()
    .single()

  if (error) {
    console.error('Error creating lead:', error)
    redirect('/admin/leads/new?error=failed')
  }

  revalidatePath('/admin')
  redirect('/admin')
}
