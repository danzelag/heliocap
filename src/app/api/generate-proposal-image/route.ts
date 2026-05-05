import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'

const PROPOSALS_BUCKET = 'proposals'
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'
const SOLAR_RENDER_PROMPT = `Create a realistic aerial view of a commercial building with a rooftop solar installation.

Use the provided satellite image as the base.
Add dark blue solar panels aligned cleanly and evenly across the usable roof area.
Panels should be grouped in clean rows, not scattered.
Avoid edges, HVAC units, and irregular shapes.
Keep the building structure unchanged and recognizable.
Do not add text, labels, or UI elements.
Lighting should be natural and realistic.
The result should look like a professional solar installation render used in a commercial proposal.`

type GenerateProposalImageBody = {
  roof_image_url?: string
  render_image_url?: string
  business_name?: string
  address?: string
  slug?: string
  lat?: number
  lng?: number
  panel_count?: number
  system_kw?: number
  solar_model?: Record<string, unknown> | null
  job_id?: string
  filtered?: boolean
  reason?: string
}

type ImageAsset = {
  buffer: Buffer
  mimeType: string
}

type GeminiInlineData = {
  data?: string
  mimeType?: string
  mime_type?: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateProposalImageBody
    const { roof_image_url, business_name, address, job_id, filtered, reason } = body

    const supabase = await createAdminClient()

    if (filtered) {
      const message = reason || 'No valid roof found for this prospect'
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'failed',
        step: message,
        progressPercent: 100,
        errorMessage: message,
      })
      return NextResponse.json({ skipped: true, reason: message })
    }

    if (!roof_image_url) {
      const message = 'No roof image available — proposal cannot be rendered'
      if (job_id) {
        await updateProposalJobProgress(supabase, {
          jobId: job_id,
          businessName: business_name,
          status: 'failed',
          step: message,
          progressPercent: 100,
          errorMessage: message,
        })
      }
      return NextResponse.json({ error: message }, { status: 400 })
    }

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      step: 'Generating proposal image',
      status: 'running',
      progressPercent: 70,
    })

    const slug = body.slug || SolarUtils.generateSlug(business_name || address || crypto.randomUUID())
    const roofAsset = await fetchImageAsset(roof_image_url)

    try {
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'Generating proposal image',
        progressPercent: 76,
      })

      const aiRender = await generateAiSolarRender(roofAsset)
      const previewBuffer = await sharp(aiRender.buffer)
        .webp({ quality: 86, effort: 4 })
        .toBuffer()
      const filePath = `${slug}/preview.webp`
      const { error } = await supabase.storage
        .from(PROPOSALS_BUCKET)
        .upload(filePath, previewBuffer, {
          contentType: 'image/webp',
          upsert: true,
        })

      if (error) throw error

      const { data } = supabase.storage.from(PROPOSALS_BUCKET).getPublicUrl(filePath)
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'Proposal image complete',
        progressPercent: 85,
      })

      return NextResponse.json({
        render_preview_url: data.publicUrl,
      })
    } catch (error) {
      console.error('[generate-proposal-image] Gemini render failed, returning roof image:', error)
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'AI render unavailable, using satellite roof image',
        progressPercent: 85,
      })

      return NextResponse.json({
        render_preview_url: roof_image_url,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function fetchImageAsset(url: string): Promise<ImageAsset> {
  const response = await fetch(assertFetchableAssetUrl(url), { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch image asset: ${response.status}`)
  }

  const mimeType = normalizeImageMimeType(response.headers.get('content-type'))
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType,
  }
}

async function generateAiSolarRender(roofAsset: ImageAsset): Promise<ImageAsset> {
  const apiKey = getGoogleImageApiKey()
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SOLAR_RENDER_PROMPT },
            {
              inline_data: {
                mime_type: roofAsset.mimeType,
                data: roofAsset.buffer.toString('base64'),
              },
            },
          ],
        }],
      }),
      cache: 'no-store',
    },
  )

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(`Gemini image generation failed: ${response.status} ${responseText.slice(0, 240)}`)
  }

  const payload = JSON.parse(responseText) as GeminiGenerateContentResponse
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || []
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data)
  const inlineData = imagePart?.inlineData || imagePart?.inline_data

  if (!inlineData?.data) {
    const text = parts.map((part) => part.text).filter(Boolean).join(' ')
    throw new Error(`Gemini did not return image data${text ? `: ${text.slice(0, 240)}` : ''}`)
  }

  return {
    buffer: Buffer.from(inlineData.data, 'base64'),
    mimeType: normalizeImageMimeType(inlineData.mimeType || inlineData.mime_type),
  }
}

function getGoogleImageApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY

  if (!key) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured')
  }

  return key
}

function normalizeImageMimeType(value?: string | null) {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase()
  if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType
  }

  return 'image/png'
}

function assertFetchableAssetUrl(value: string) {
  const url = new URL(value)
  const hostname = url.hostname.toLowerCase()

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Asset URLs must use http or https')
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    throw new Error('Private asset URLs are not allowed')
  }

  return url
}
