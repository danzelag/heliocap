import { cache } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { SolarUtils } from '@/lib/solar-utils';

export type LeadStatus = 'published' | 'contacted' | 'emailed' | 'replied' | 'booked' | 'archived';

export interface Lead {
  id: string;
  business_name: string;
  contact_name: string | null;
  address: string | null;
  slug: string;
  logo_url: string | null;
  roof_image_url: string | null;
  render_image_url: string | null;
  video_url: string | null;
  estimated_savings: number | null;
  estimated_payback: number | null;
  roof_sqft: number | null;
  utility_rate: number | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  building_type: string | null;
  status: LeadStatus;
  created_at: string;
}

export type InsertLead = Omit<Lead, 'id' | 'created_at'>;
export type UpdateLead = Partial<InsertLead>;

export class LeadService {
  /**
   * Fetches a lead by its slug for the public landing page.
   * Published proposals should work with the anon key/RLS alone; the admin
   * client is only a fallback for authenticated preview workflows.
   */
  static getLeadBySlug = cache(async (slug: string): Promise<Lead | null> => {
    const publicSupabase = await createClient();
    const { data: publicLead, error: publicError } = await publicSupabase
      .from('leads')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (publicError) {
      console.error('Error fetching published lead by slug:', publicError);
      throw new Error('Failed to fetch published proposal');
    }

    if (publicLead) return publicLead;

    try {
      const adminSupabase = await createAdminClient();
      const { data: previewLead, error: previewError } = await adminSupabase
        .from('leads')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (previewError) {
        console.error('Error fetching preview lead by slug:', previewError);
        throw new Error('Failed to fetch proposal preview');
      }

      return previewLead;
    } catch (error) {
      console.error('Error creating Supabase admin client for proposal preview:', error);
      return null;
    }
  });

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
