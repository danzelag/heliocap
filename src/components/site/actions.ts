'use server'

import { SubmissionService } from '@/services/submission.service'

export async function submitCtaForm(leadId: string, formData: FormData) {
  const success = await SubmissionService.saveCtaSubmission({
    lead_id: leadId,
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    phone: formData.get('phone') as string,
    company: formData.get('company') as string,
    message: formData.get('message') as string,
  })

  if (!success) {
    throw new Error('Failed to save submission')
  }

  return { success: true }
}
