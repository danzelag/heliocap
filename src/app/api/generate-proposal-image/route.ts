import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'

const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 720
const PROPOSALS_BUCKET = 'proposals'

type GenerateProposalImageBody = {
  roof_image_url?: string
  render_image_url?: string
  business_name?: string
  address?: string
  solar_model?: Record<string, unknown>
}

type PanelRect = {
  x: string
  y: string
  width: string
  height: string
  rx: string
  transform: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateProposalImageBody
    const { roof_image_url, render_image_url, business_name, address } = body

    if (!roof_image_url) {
      return NextResponse.json({ error: 'roof_image_url is required' }, { status: 400 })
    }
    if (!render_image_url) {
      return NextResponse.json({ error: 'render_image_url is required' }, { status: 400 })
    }

    const slug = SolarUtils.generateSlug(business_name || address || crypto.randomUUID())
    const [roofBuffer, renderSvg] = await Promise.all([
      fetchAssetBuffer(roof_image_url),
      fetchAssetText(render_image_url),
    ])

    const basePng = await sharp(roofBuffer)
      .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: 'cover' })
      .png()
      .toBuffer()

    const panelRects = extractPanelRects(renderSvg)
    const previewSvg = buildPreviewSvg(basePng, panelRects)
    const previewBuffer = await sharp(Buffer.from(previewSvg))
      .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer()

    const supabase = await createAdminClient()
    const filePath = `${slug}/preview.webp`
    const { error } = await supabase.storage
      .from(PROPOSALS_BUCKET)
      .upload(filePath, previewBuffer, {
        contentType: 'image/webp',
        upsert: true,
      })

    if (error) throw error

    const { data } = supabase.storage.from(PROPOSALS_BUCKET).getPublicUrl(filePath)

    return NextResponse.json({
      render_preview_url: data.publicUrl,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function fetchAssetBuffer(url: string) {
  const response = await fetch(assertFetchableAssetUrl(url), { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch image asset: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function fetchAssetText(url: string) {
  const response = await fetch(assertFetchableAssetUrl(url), { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch render asset: ${response.status}`)
  }
  return response.text()
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

function extractPanelRects(svg: string): PanelRect[] {
  const rects: PanelRect[] = []
  const rectPattern = /<rect\b[^>]*\btransform="([^"]*translate\([^"]*)"[^>]*\/?>/gi
  let match: RegExpExecArray | null

  while ((match = rectPattern.exec(svg))) {
    const tag = match[0]
    const panel = {
      x: getSvgAttr(tag, 'x') || '-3',
      y: getSvgAttr(tag, 'y') || '-5',
      width: getSvgAttr(tag, 'width') || '6',
      height: getSvgAttr(tag, 'height') || '10',
      rx: getSvgAttr(tag, 'rx') || '1',
      transform: getSvgAttr(tag, 'transform') || '',
    }

    if (panel.transform) rects.push(panel)
  }

  return rects
}

function getSvgAttr(tag: string, attr: string) {
  const match = tag.match(new RegExp(`\\b${attr}="([^"]*)"`, 'i'))
  return match?.[1] ? escapeXml(match[1]) : ''
}

function buildPreviewSvg(basePng: Buffer, panels: PanelRect[]) {
  const base64 = basePng.toString('base64')
  const panelMarkup = panels.map(renderPanelRect).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
  <image href="data:image/png;base64,${base64}" x="0" y="0" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
  <g opacity="0.92">${panelMarkup}</g>
</svg>`
}

function renderPanelRect(panel: PanelRect) {
  return `<rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${panel.rx}" fill="#123047" stroke="#8ee8f2" stroke-width="0.42" opacity="0.86" transform="${panel.transform}"/>`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
