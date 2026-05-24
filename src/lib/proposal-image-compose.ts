import sharp from 'sharp'
import type { SolarRoofFocusCrop } from '@/lib/openclaw-google'

export async function buildSolarRgbProposalRender({
  roofImageUrl,
  panelLayerSvg,
  outputWidth,
  outputHeight,
  focusCrop,
  maskImageUrl,
  rotationDegrees = 0,
}: {
  roofImageUrl: string
  panelLayerSvg: string
  outputWidth: number
  outputHeight: number
  focusCrop?: SolarRoofFocusCrop | null
  maskImageUrl?: string | null
  rotationDegrees?: number
}) {
  const roofBuffer = await fetchImageBuffer(roofImageUrl)
  const sourceMetadata = await sharp(roofBuffer, { limitInputPixels: false }).metadata()
  const fullSourceWidth = sourceMetadata.width || outputWidth
  const fullSourceHeight = sourceMetadata.height || outputHeight
  const safeCrop = getSafeCrop(focusCrop, fullSourceWidth, fullSourceHeight)
  const source = safeCrop
    ? sharp(roofBuffer, { limitInputPixels: false }).extract(safeCrop)
    : sharp(roofBuffer, { limitInputPixels: false })

  const sourceBuffer = await source.toBuffer()
  const metadata = await sharp(sourceBuffer).metadata()
  const croppedSourceWidth = metadata.width || outputWidth
  const croppedSourceHeight = metadata.height || outputHeight
  const scale = Math.min(outputWidth / croppedSourceWidth, outputHeight / croppedSourceHeight)
  const renderedWidth = Math.round(croppedSourceWidth * scale)
  const renderedHeight = Math.round(croppedSourceHeight * scale)
  const left = Math.round((outputWidth - renderedWidth) / 2)
  const top = Math.round((outputHeight - renderedHeight) / 2)
  const foreground = await sharp(sourceBuffer)
    .resize(renderedWidth, renderedHeight, { fit: 'fill' })
    .modulate({ brightness: 1.05, saturation: 0.82 })
    .linear(1.03, -2)
    .sharpen({ sigma: 0.55, m1: 0.38, m2: 1.05 })
    .webp({ quality: 95, effort: 5 })
    .toBuffer()
  const panelLayer = await buildPanelLayer({
    panelLayerSvg,
    outputWidth,
    outputHeight,
    maskImageUrl,
    focusCrop: safeCrop,
    sourceWidth: fullSourceWidth,
    sourceHeight: fullSourceHeight,
    renderedWidth,
    renderedHeight,
    left,
    top,
  })

  const composite = sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: '#0B0E10',
    },
  })
    .composite([
      { input: foreground, left, top },
      { input: panelLayer, left: 0, top: 0 },
      { input: buildPresentationOverlaySvg(outputWidth, outputHeight), left: 0, top: 0 },
    ])

  const rotated = shouldApplyRotation(rotationDegrees)
    ? composite
        .rotate(rotationDegrees, { background: '#0B0E10' })
        .resize(outputWidth, outputHeight, {
          fit: 'contain',
          background: '#0B0E10',
        })
    : composite

  return rotated.webp({ quality: 95, effort: 6 }).toBuffer()
}

async function fetchImageBuffer(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function getSafeCrop(
  focusCrop: SolarRoofFocusCrop | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): SolarRoofFocusCrop | null {
  if (!focusCrop) return null

  const left = clamp(Math.floor(focusCrop.left), 0, Math.max(0, sourceWidth - 1))
  const top = clamp(Math.floor(focusCrop.top), 0, Math.max(0, sourceHeight - 1))
  const width = clamp(Math.floor(focusCrop.width), 1, sourceWidth - left)
  const height = clamp(Math.floor(focusCrop.height), 1, sourceHeight - top)

  return { left, top, width, height }
}

async function buildPanelLayer({
  panelLayerSvg,
  outputWidth,
  outputHeight,
  maskImageUrl,
  focusCrop,
  sourceWidth,
  sourceHeight,
  renderedWidth,
  renderedHeight,
  left,
  top,
}: {
  panelLayerSvg: string
  outputWidth: number
  outputHeight: number
  maskImageUrl?: string | null
  focusCrop: SolarRoofFocusCrop | null
  sourceWidth: number
  sourceHeight: number
  renderedWidth: number
  renderedHeight: number
  left: number
  top: number
}) {
  const panelLayer = await sharp(Buffer.from(panelLayerSvg), { limitInputPixels: false })
    .resize(outputWidth, outputHeight, { fit: 'fill' })
    .png()
    .toBuffer()

  if (!maskImageUrl) return panelLayer

  try {
    const maskBuffer = await fetchImageBuffer(maskImageUrl)
    const maskCanvas = await buildAlphaMaskCanvas({
      maskBuffer,
      outputWidth,
      outputHeight,
      focusCrop,
      sourceWidth,
      sourceHeight,
      renderedWidth,
      renderedHeight,
      left,
      top,
    })

    if (!maskCanvas) return panelLayer

    return sharp(panelLayer)
      .composite([{ input: maskCanvas, blend: 'dest-in' }])
      .png()
      .toBuffer()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[proposal-image-compose] Solar mask clip skipped: ${message}`)
    return panelLayer
  }
}

async function buildAlphaMaskCanvas({
  maskBuffer,
  outputWidth,
  outputHeight,
  focusCrop,
  sourceWidth,
  sourceHeight,
  renderedWidth,
  renderedHeight,
  left,
  top,
}: {
  maskBuffer: Buffer
  outputWidth: number
  outputHeight: number
  focusCrop: SolarRoofFocusCrop | null
  sourceWidth: number
  sourceHeight: number
  renderedWidth: number
  renderedHeight: number
  left: number
  top: number
}) {
  const maskMetadata = await sharp(maskBuffer, { limitInputPixels: false }).metadata()
  const maskWidth = maskMetadata.width || sourceWidth
  const maskHeight = maskMetadata.height || sourceHeight
  const scaledCrop = focusCrop
    ? {
        left: clamp(Math.round(focusCrop.left * (maskWidth / sourceWidth)), 0, Math.max(0, maskWidth - 1)),
        top: clamp(Math.round(focusCrop.top * (maskHeight / sourceHeight)), 0, Math.max(0, maskHeight - 1)),
        width: clamp(Math.round(focusCrop.width * (maskWidth / sourceWidth)), 1, maskWidth),
        height: clamp(Math.round(focusCrop.height * (maskHeight / sourceHeight)), 1, maskHeight),
      }
    : null

  const safeScaledCrop = getSafeCrop(scaledCrop, maskWidth, maskHeight)
  const maskSource = safeScaledCrop
    ? sharp(maskBuffer, { limitInputPixels: false }).extract(safeScaledCrop)
    : sharp(maskBuffer, { limitInputPixels: false })
  const alpha = await maskSource
    .resize(renderedWidth, renderedHeight, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()

  if (!alpha.length) return null

  const rgba = Buffer.alloc(renderedWidth * renderedHeight * 4)
  for (let index = 0; index < renderedWidth * renderedHeight; index += 1) {
    const value = (alpha[index] || 0) > 0 ? 255 : 0
    const offset = index * 4
    rgba[offset] = 255
    rgba[offset + 1] = 255
    rgba[offset + 2] = 255
    rgba[offset + 3] = value
  }

  const alphaTile = await sharp(rgba, {
    raw: {
      width: renderedWidth,
      height: renderedHeight,
      channels: 4,
    },
  }).png().toBuffer()

  return sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: alphaTile, left, top }])
    .png()
    .toBuffer()
}

function buildPresentationOverlaySvg(width: number, height: number) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="vignette" cx="50%" cy="48%" r="72%">
      <stop offset="66%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#vignette)"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="18" ry="18" fill="none" stroke="#D99028" stroke-opacity="0.08" stroke-width="4"/>
</svg>`)
}

function shouldApplyRotation(rotationDegrees: number) {
  return Number.isFinite(rotationDegrees) &&
    Math.abs(rotationDegrees) >= 4 &&
    Math.abs(rotationDegrees) <= 15
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
