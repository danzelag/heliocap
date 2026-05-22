import { SupabaseClient } from '@supabase/supabase-js'

type UploadAssetArgs = {
  supabase: SupabaseClient
  bucket?: 'leads' | 'prospects'
  slug: string
  fileName: string
  body: ArrayBuffer | Buffer | string
  contentType: string
}

export async function uploadLeadAsset({
  supabase,
  bucket = 'leads',
  slug,
  fileName,
  body,
  contentType,
}: UploadAssetArgs) {
  const resolvedBucket = await resolveStorageBucket(supabase, bucket)
  const filePath = `${slug}/${fileName}`
  const { error } = await supabase.storage
    .from(resolvedBucket)
    .upload(filePath, body, { contentType, upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from(resolvedBucket).getPublicUrl(filePath)
  return data.publicUrl
}

export async function listManualStreetViewReferenceUrls({
  supabase,
  prospectId,
}: {
  supabase: SupabaseClient
  prospectId: string
}) {
  const bucket = await resolveStorageBucket(supabase, 'prospects')
  const folder = `${prospectId}/references`
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 100, sortBy: { column: 'name', order: 'asc' } })

  if (error) {
    console.error(`[openclaw-google] Manual Street View reference listing failed: ${error.message}`)
    return []
  }

  return (data || [])
    .filter((file) => /^manual-street-view-.+\.(jpe?g|png|webp)$/i.test(file.name))
    .map((file) => {
      const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(`${folder}/${file.name}`)
      return publicUrl.publicUrl
    })
}

export async function resolveStorageBucket(
  supabase: SupabaseClient,
  bucket: NonNullable<UploadAssetArgs['bucket']>,
): Promise<string> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw listError

  const exactMatch = buckets.find((candidate) => candidate.id === bucket || candidate.name === bucket)
  if (exactMatch) return exactMatch.id

  const caseMatch = buckets.find((candidate) => (
    candidate.id.toLowerCase() === bucket.toLowerCase() ||
    candidate.name.toLowerCase() === bucket.toLowerCase()
  ))
  if (caseMatch) return caseMatch.id

  const { error: createError } = await supabase.storage.createBucket(bucket, { public: true })
  if (createError) throw createError

  return bucket
}
