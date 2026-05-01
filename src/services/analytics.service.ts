import { createClient } from '@/lib/supabase-server';

export class AnalyticsService {
  /**
   * Tracks a page view for a specific lead.
   * This is a "fire and forget" function so it doesn't block page load.
   */
  static async trackPageView(leadId: string, slug: string, userAgent: string): Promise<void> {
    const supabase = await createClient();
    
    supabase.from('page_views').insert([
      {
        lead_id: leadId,
        slug,
        user_agent: userAgent
      }
    ]).then(({ error }) => {
      if (error) console.error('Failed to track page view:', error);
    });
  }
}
