import {
  downloadVertexVeoVideo,
  fetchVertexVeoStatus,
  submitVertexVeoRender,
} from '@/lib/vertex-veo'

const VEO_CINEMATIC_PROMPT =
  'Cinematic aerial shot of a single commercial building. Smooth, slow drone-style flyover, gentle parallax. Premium architectural visualization aesthetic, clean materials, soft natural daylight, subtle long shadows, gentle atmospheric depth. During the shot, dark commercial solar panels appear naturally across the roof in a clean grid layout. Preserve the building footprint and roof shape from the reference image. No text, no UI, no labels, no map artifacts, no Google Maps style, no people, no vehicles, no logos, no neon, no cartoon. Style: high-end infrastructure visualization, premium energy brand, calm and confident.'

export async function submitVeoRender({
  seedBuffer,
  seedMimeType,
}: {
  seedBuffer: Buffer
  seedMimeType: string
}): Promise<{ operationName: string }> {
  const { operationName } = await submitVertexVeoRender({
    prompt: VEO_CINEMATIC_PROMPT,
    imageBuffer: seedBuffer,
    imageMimeType: seedMimeType,
  })

  return { operationName }
}

export async function checkVeoStatus(
  operationName: string,
): Promise<{ done: boolean; failed?: boolean; videoUrl?: string | null; gcsUri?: string | null }> {
  const status = await fetchVertexVeoStatus(operationName)

  return {
    done: status.done,
    failed: status.failed,
    videoUrl: status.videoUrl,
    gcsUri: status.gcsUri,
  }
}

export async function finalizeVeoRender(operationName: string): Promise<Buffer> {
  return downloadVertexVeoVideo(operationName)
}
