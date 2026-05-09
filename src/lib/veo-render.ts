const DEFAULT_VEO_MODEL = 'veo-3.0-generate-001'
const VEO_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const VEO_CINEMATIC_PROMPT =
  'Cinematic aerial shot of a single commercial building. Smooth, slow drone-style flyover, gentle parallax, 5 seconds. Premium architectural visualization aesthetic — clean materials, soft natural daylight, subtle long shadows, gentle atmospheric depth. During the shot, dark commercial solar panels appear naturally across the roof in a clean grid layout. Preserve the building footprint and roof shape from the reference image. No text, no UI, no labels, no map artifacts, no Google Maps style, no people, no vehicles, no logos, no neon, no cartoon. Style: high-end infrastructure visualization, premium energy brand, calm and confident.'

type VeoVideo = {
  uri?: string
  bytesBase64Encoded?: string
}

type VeoOperationResponse = {
  name?: string
  done?: boolean
  error?: { code?: number; message?: string }
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: VeoVideo }>
    }
    predictions?: Array<{
      video?: { uri?: string }
      uri?: string
      bytesBase64Encoded?: string
    }>
  }
}

export async function submitVeoRender({
  seedBuffer,
  seedMimeType,
}: {
  seedBuffer: Buffer
  seedMimeType: string
}): Promise<{ operationName: string }> {
  const apiKey = getApiKey()
  const model = process.env.VEO_MODEL ?? DEFAULT_VEO_MODEL
  const requestedDurationSeconds = 5
  const durationSeconds = Math.min(8, Math.max(4, requestedDurationSeconds ?? 5))
  if (durationSeconds !== 5) {
    throw new Error('Veo duration must remain fixed at 5 seconds')
  }
  console.log('VEO_DURATION_SENT', durationSeconds)

  const res = await fetch(`${VEO_BASE}/models/${model}:predictLongRunning`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: VEO_CINEMATIC_PROMPT,
          image: {
            bytesBase64Encoded: seedBuffer.toString('base64'),
            mimeType: seedMimeType,
          },
        },
      ],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 5,
        sampleCount: 1,
      },
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Veo submit failed: ${res.status} ${text.slice(0, 240)}`)
  }

  const data = (await res.json()) as VeoOperationResponse
  if (!data.name) {
    throw new Error('Veo submit: no operation name in response')
  }

  return { operationName: data.name }
}

export async function checkVeoStatus(
  operationName: string,
): Promise<{ done: boolean; failed?: boolean }> {
  const apiKey = getApiKey()

  const res = await fetch(`${VEO_BASE}/${operationName}`, {
    headers: { 'x-goog-api-key': apiKey },
    cache: 'no-store',
  })

  if (!res.ok) {
    return { done: false, failed: true }
  }

  const data = (await res.json()) as VeoOperationResponse
  if (data.error) {
    return { done: true, failed: true }
  }

  return { done: data.done === true }
}

export async function finalizeVeoRender(operationName: string): Promise<Buffer> {
  const apiKey = getApiKey()

  const res = await fetch(`${VEO_BASE}/${operationName}`, {
    headers: { 'x-goog-api-key': apiKey },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Veo finalize poll failed: ${res.status} ${text.slice(0, 240)}`)
  }

  const data = (await res.json()) as VeoOperationResponse

  if (data.error) {
    throw new Error(`Veo operation error: ${data.error.message ?? data.error.code}`)
  }

  if (!data.done) {
    throw new Error('Veo operation is not yet done — finalize called too early')
  }

  return extractVideoBuffer(data)
}

async function extractVideoBuffer(data: VeoOperationResponse): Promise<Buffer> {
  // Format A: generateVideoResponse (Vertex-style response via Gemini API)
  const samples = data.response?.generateVideoResponse?.generatedSamples
  const sampleVideo = samples?.[0]?.video

  if (sampleVideo?.bytesBase64Encoded) {
    return Buffer.from(sampleVideo.bytesBase64Encoded, 'base64')
  }
  if (sampleVideo?.uri) {
    return downloadUri(sampleVideo.uri)
  }

  // Format B: predictions array (alternative Gemini response format)
  const prediction = data.response?.predictions?.[0]
  if (prediction?.bytesBase64Encoded) {
    return Buffer.from(prediction.bytesBase64Encoded, 'base64')
  }
  const predUri = prediction?.video?.uri ?? prediction?.uri
  if (predUri) {
    return downloadUri(predUri)
  }

  throw new Error(
    'Veo: no video data found in operation response. Inspect the raw API response to identify the correct field path.',
  )
}

async function downloadUri(uri: string): Promise<Buffer> {
  const res = await fetch(uri, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Veo video URI download failed: ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return key
}
