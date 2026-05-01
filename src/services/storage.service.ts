import { SupabaseClient } from '@supabase/supabase-js';

export class StorageService {
  /**
   * Uploads an image for a specific lead to Supabase Storage.
   * Takes the SupabaseClient as an argument so it can be used from the browser client 
   * (which is much better for large file uploads).
   */
  static async uploadLeadImage(
    supabase: SupabaseClient,
    slug: string,
    file: File,
    type: 'logo' | 'roof' | 'render'
  ): Promise<string | null> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${type}.${fileExt}`;
    // Creates a folder structure like: leads/billy-bobs-roof/render.jpg
    const filePath = `${slug}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('leads')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('leads').getPublicUrl(filePath);
    return data.publicUrl;
  }
}
