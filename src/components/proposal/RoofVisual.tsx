'use client'

import { useRef, useEffect } from 'react'

const COS30 = Math.cos(Math.PI / 6)
const BW = 32
const BD = 20
const BH = 5

function pt(
  ox: number, oy: number, scale: number,
  wx: number, wy: number, wz: number,
): [number, number] {
  return [
    ox + (wx - wy) * scale * COS30,
    oy + (wx + wy) * scale * 0.5 - wz * scale,
  ]
}

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, panelCount: number) {
  const SCALE = Math.min(W / 90, H / 58)
  const ox = W * 0.48
  const oy = H * 0.52
  const p = (wx: number, wy: number, wz: number): [number, number] =>
    pt(ox, oy, SCALE, wx, wy, wz)

  ctx.clearRect(0, 0, W, H)

  // ambient glow
  const glow = ctx.createRadialGradient(ox, oy - SCALE * 4, 0, ox, oy - SCALE * 4, SCALE * 28)
  glow.addColorStop(0, 'rgba(79,166,198,0.07)')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ground shadow
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.moveTo(...p(0, 0, 0)); ctx.lineTo(...p(BW, 0, 0))
  ctx.lineTo(...p(BW, BD, 0)); ctx.lineTo(...p(0, BD, 0))
  ctx.closePath()
  ctx.fillStyle = '#020a0f'
  ctx.fill()
  ctx.restore()

  // south wall
  {
    const grad = ctx.createLinearGradient(...p(0, 0, 0), ...p(0, 0, BH))
    grad.addColorStop(0, '#1a3245')
    grad.addColorStop(1, '#0c1e2c')
    ctx.beginPath()
    ctx.moveTo(...p(0, 0, 0)); ctx.lineTo(...p(BW, 0, 0))
    ctx.lineTo(...p(BW, 0, BH)); ctx.lineTo(...p(0, 0, BH))
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // window bays
    const winY = BH * 0.38, winH = BH * 0.32, bays = 6, bayW = BW / (bays + 1)
    for (let i = 0; i < bays; i++) {
      const wx0 = bayW * (i + 0.25), wx1 = bayW * (i + 0.75)
      ctx.beginPath()
      ctx.moveTo(...p(wx0, 0, winY)); ctx.lineTo(...p(wx1, 0, winY))
      ctx.lineTo(...p(wx1, 0, winY + winH)); ctx.lineTo(...p(wx0, 0, winY + winH))
      ctx.closePath()
      ctx.fillStyle = 'rgba(20,65,100,0.85)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(143,211,232,0.12)'
      ctx.lineWidth = 0.6
      ctx.stroke()
    }

    // entrance door
    const dW = BW * 0.06, dH = BH * 0.45, dX = BW * 0.5 - dW / 2
    ctx.beginPath()
    ctx.moveTo(...p(dX, 0, 0)); ctx.lineTo(...p(dX + dW, 0, 0))
    ctx.lineTo(...p(dX + dW, 0, dH)); ctx.lineTo(...p(dX, 0, dH))
    ctx.closePath()
    ctx.fillStyle = 'rgba(15,35,52,0.95)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(143,211,232,0.2)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  // east wall
  {
    const grad = ctx.createLinearGradient(...p(BW, 0, 0), ...p(BW, BD, 0))
    grad.addColorStop(0, '#111f2c')
    grad.addColorStop(1, '#091520')
    ctx.beginPath()
    ctx.moveTo(...p(BW, 0, 0)); ctx.lineTo(...p(BW, BD, 0))
    ctx.lineTo(...p(BW, BD, BH)); ctx.lineTo(...p(BW, 0, BH))
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
  }

  // roof
  {
    ctx.beginPath()
    ctx.moveTo(...p(0, 0, BH)); ctx.lineTo(...p(BW, 0, BH))
    ctx.lineTo(...p(BW, BD, BH)); ctx.lineTo(...p(0, BD, BH))
    ctx.closePath()
    ctx.fillStyle = '#0d1e2a'
    ctx.fill()
  }

  // panel array
  {
    const pW = 0.88, pD = 0.46, gX = 0.1, gY = 0.08, ins = 0.9
    const stepX = pW + gX, stepY = pD + gY
    const cols = Math.floor((BW - ins * 2) / stepX)
    const rows = Math.floor((BD - ins * 2) / stepY)
    const total = cols * rows
    const toShow = Math.round(total * Math.min(1, panelCount / Math.max(total, 1)))
    const startX = ins + (BW - ins * 2 - cols * stepX + gX) / 2
    const startY = ins + (BD - ins * 2 - rows * stepY + gY) / 2
    const ZP = BH + 0.06

    let shown = 0
    for (let r = 0; r < rows && shown < toShow; r++) {
      for (let c = 0; c < cols && shown < toShow; c++) {
        const wx = startX + c * stepX, wy = startY + r * stepY
        const corners: [number, number][] = [
          p(wx, wy, ZP), p(wx + pW, wy, ZP),
          p(wx + pW, wy + pD, ZP), p(wx, wy + pD, ZP),
        ]
        ctx.beginPath()
        ctx.moveTo(...corners[0])
        corners.slice(1).forEach(c => ctx.lineTo(...c))
        ctx.closePath()
        ctx.fillStyle = '#1a3248'
        ctx.fill()
        ctx.strokeStyle = 'rgba(143,211,232,0.22)'
        ctx.lineWidth = 0.5
        ctx.stroke()
        // cell divider
        ctx.beginPath()
        ctx.moveTo((corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2)
        ctx.lineTo((corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2)
        ctx.strokeStyle = 'rgba(143,211,232,0.10)'
        ctx.lineWidth = 0.35
        ctx.stroke()
        shown++
      }
    }

    // gold glow over panels
    const cx = p(BW / 2, BD / 2, ZP)
    const panelGlow = ctx.createRadialGradient(cx[0], cx[1], 0, cx[0], cx[1], SCALE * 14)
    panelGlow.addColorStop(0, 'rgba(245,185,66,0.14)')
    panelGlow.addColorStop(0.5, 'rgba(245,185,66,0.05)')
    panelGlow.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.moveTo(...p(0, 0, ZP)); ctx.lineTo(...p(BW, 0, ZP))
    ctx.lineTo(...p(BW, BD, ZP)); ctx.lineTo(...p(0, BD, ZP))
    ctx.closePath()
    ctx.fillStyle = panelGlow
    ctx.fill()
  }

  // edge highlights
  ctx.lineWidth = 0.9
  const edges: [[number, number, number], [number, number, number], string][] = [
    [[0, 0, BH], [BW, 0, BH], 'rgba(143,211,232,0.42)'],
    [[BW, 0, BH], [BW, BD, BH], 'rgba(143,211,232,0.22)'],
    [[0, 0, 0], [BW, 0, 0], 'rgba(143,211,232,0.18)'],
  ]
  edges.forEach(([a, b, color]) => {
    ctx.beginPath()
    ctx.moveTo(...p(...a)); ctx.lineTo(...p(...b))
    ctx.strokeStyle = color; ctx.stroke()
  })
  ;([[0, 0], [BW, 0], [BW, BD]] as [number, number][]).forEach(([wx, wy]) => {
    ctx.beginPath()
    ctx.moveTo(...p(wx, wy, 0)); ctx.lineTo(...p(wx, wy, BH))
    ctx.strokeStyle = 'rgba(143,211,232,0.14)'; ctx.stroke()
  })
}

export function RoofVisual({ systemSizeKw }: { systemSizeKw: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panelCount = Math.min(1400, Math.max(60, Math.round(systemSizeKw * 2.4)))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const render = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      drawScene(ctx, rect.width, rect.height, panelCount)
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [panelCount])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between">
          <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-[#8fd3e8] backdrop-blur-sm">
            Roof Array Model
          </span>
          <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-[#f5b942] backdrop-blur-sm">
            {panelCount} modules
          </span>
        </div>
        <div className="flex items-end justify-between">
          <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-[#8fd3e8] backdrop-blur-sm">
            {systemSizeKw} kW system
          </span>
          <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-[#6e8594] backdrop-blur-sm">
            Stylized layout
          </span>
        </div>
      </div>
    </div>
  )
}
