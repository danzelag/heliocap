import { createClient, createAdminClient } from '@/lib/supabase-server';
import { SolarUtils } from '@/lib/solar-utils';

export interface Lead {
  id: string;
  business_name: string;
  contact_name: string | null;
  address: string | null;
  slug: string;
  logo_url: string | null;
  roof_image_url: string | null;
  render_image_url: string | null;
  estimated_savings: number | null;
  estimated_payback: number | null;
  roof_sqft: number | null;
  utility_rate: number | null;
  notes: string | null;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
}

export type InsertLead = Omit<Lead, 'id' | 'created_at'>;
export type UpdateLead = Partial<InsertLead>;

export class LeadService {
  /**
   * Fetches a published lead by its slug for the public landing page.
   */
  static async getLeadBySlug(slug: string): Promise<Lead | null> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      console.error('Error fetching lead by slug:', error);
      return null;
    }
    return data;
  }

  /**
   * Fetches any lead by ID for the admin dashboard.
   */
  static async getLeadById(id: string): Promise<Lead | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Lists all leads for the admin dashboard.
   */
  static async listLeads(): Promise<Lead[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing leads:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Creates a new lead (Admin only).
   */
  static async createLead(lead: InsertLead): Promise<Lead | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('leads')
      .insert([lead])
      .select()
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return null;
    }
    return data;
  }

  /**
   * Updates an existing lead (Admin only).
   */
  static async updateLead(id: string, updates: UpdateLead): Promise<Lead | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lead:', error);
      return null;
    }
    return data;
  }

  /**
   * Utility to auto-generate a URL-friendly slug.
   */
  static generateSlug(businessName: string): string {
    return SolarUtils.generateSlug(businessName);
  }
}
