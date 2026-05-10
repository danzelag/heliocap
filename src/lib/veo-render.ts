import {
  DEFAULT_VEO_CINEMATIC_PROMPT,
  downloadVertexVeoVideo,
  fetchVertexVeoStatus,
  submitVertexVeoRender,
} from '@/lib/vertex-veo'

export async function submitVeoRender({
  seedBuffer,
  seedMimeType,
}: {
  seedBuffer: Buffer
  seedMimeType: string
}): Promise<{ operationName: string }> {
  const { operationName } = await submitVertexVeoRender({
    prompt: DEFAULT_VEO_CINEMATIC_PROMPT,
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
