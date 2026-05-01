import { createClient } from '@/lib/supabase-server';

export interface CtaSubmission {
  lead_id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
}

export class SubmissionService {
  /**
   * Saves a CTA form submission from the public landing page.
   */
  static async saveCtaSubmission(submission: CtaSubmission): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('cta_submissions')
      .insert([submission]);

    if (error) {
      console.error('Error saving CTA submission:', error);
      return false;
    }
    return true;
  }
}
