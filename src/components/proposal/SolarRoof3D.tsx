'use client'

import { useEffect, useRef, useState } from 'react'

type RawInsights = {
  center?: { latitude: number; longitude: number }
  solarPotential?: {
    roofSegmentStats?: {
      pitchDegrees?: number
      azimuthDegrees?: number
      stats?: { areaMeters2?: number }
      center?: { latitude: number; longitude: number }
    }[]
    solarPanels?: {
      center?: { latitude: number; longitude: number }
      orientation?: string
      segmentIndex?: number
      yearlyEnergyDcKwh?: number
    }[]
    maxArrayPanelsCount?: number
  }
}

interface Props {
  lat: number
  lng: number
  panelCount?: number | null
}

export function SolarRoof3D({ lat, lng, panelCount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let dead = false
    let cleanup: (() => void) | null = null

    async function boot() {
      try {
        const res = await fetch(`/api/solar-insights?lat=${lat}&lng=${lng}`)
        const insights: RawInsights | null = res.ok ? await res.json() : null
        if (dead) return

        const THREE = await import('three')
        if (dead) return

        const canvas = canvasRef.current!
        const container = containerRef.current!
        const W = container.offsetWidth || 900
        const H = container.offsetHeight || 560

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
        renderer.setSize(W, H)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setClearColor(0x0b0e10, 1)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap

        const scene = new THREE.Scene()
        const camera = setupCamera(THREE, W, H)
        buildRoof(THREE, scene, insights, lat, lng, panelCount ?? null)

        let raf: number
        let t = 0
        // Slow orbit: 1 revolution per 80 seconds at 60fps
        const ORBIT_SPEED = (2 * Math.PI) / (80 * 60)
        const CAM_DIST = 25
        const CAM_ELEV = 0.58 // ~33°

        function tick() {
          raf = requestAnimationFrame(tick)
          t += ORBIT_SPEED
          camera.position.set(
            Math.sin(t) * CAM_DIST,
            CAM_ELEV * CAM_DIST,
            Math.cos(t) * CAM_DIST,
          )
          camera.lookAt(0, 0, 0)
          renderer.render(scene, camera)
        }
        tick()

        cleanup = () => {
          cancelAnimationFrame(raf)
          renderer.dispose()
        }

        if (!dead) setPhase('ready')
      } catch (err) {
        console.error('[SolarRoof3D]', err)
        if (!dead) setPhase('error')
      }
    }

    boot()

    return () => {
      dead = true
      cleanup?.()
    }
  }, [lat, lng, panelCount])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-xl">
      {phase === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b0e10]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#d99028]/30 border-t-[#d99028]" />
          <span className="text-[11px] tracking-widest text-[#6b665e] uppercase">Building 3D model</span>
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e10]">
          <span className="text-xs text-[#6b665e]">3D render unavailable for this address</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: phase === 'ready' ? 'block' : 'none' }}
      />
    </div>
  )
}

// ─── Three.js scene helpers ────────────────────────────────────────────────────

type ThreeMod = typeof import('three')

function setupCamera(THREE: ThreeMod, W: number, H: number) {
  const aspect = W / H
  const span = 5
  const camera = new THREE.OrthographicCamera(
    (-span * aspect) / 2,
    (span * aspect) / 2,
    span / 2,
    -span / 2,
    0.01,
    200,
  )
  camera.position.set(0, 14.5, 25)
  camera.lookAt(0, 0, 0)
  return camera
}

function project(lat: number, lng: number, cLat: number, cLng: number) {
  const R = 6371000
  const x = (lng - cLng) * (Math.PI / 180) * R * Math.cos((cLat * Math.PI) / 180)
  const z = -(lat - cLat) * (Math.PI / 180) * R
  return { x, z }
}

function buildRoof(
  THREE: ThreeMod,
  scene: InstanceType<ThreeMod['Scene']>,
  insights: RawInsights | null,
  centerLat: number,
  centerLng: number,
  targetPanels: number | null,
) {
  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x18202e, 1.1))

  const sun = new THREE.DirectionalLight(0xd09428, 1.6)
  sun.position.set(-6, 9, -4)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(1024)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 80
  sun.shadow.camera.left = -8
  sun.shadow.camera.right = 8
  sun.shadow.camera.top = 8
  sun.shadow.camera.bottom = -8
  scene.add(sun)

  const fill = new THREE.DirectionalLight(0x3a5878, 0.55)
  fill.position.set(5, 3, 6)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0x8090a8, 0.2)
  rim.position.set(0, -4, 0)
  scene.add(rim)

  // ── Data extraction ─────────────────────────────────────────────────────────
  const rawPanels = (insights?.solarPotential?.solarPanels ?? []).filter((p) => p.center)
  const maxCount = targetPanels
    ? Math.min(rawPanels.length, targetPanels)
    : Math.min(rawPanels.length, 1800)

  if (!rawPanels.length) {
    addPlaceholder(THREE, scene)
    return
  }

  // Best panels first (highest yearly energy)
  const panels = [...rawPanels]
    .sort((a, b) => (b.yearlyEnergyDcKwh ?? 0) - (a.yearlyEnergyDcKwh ?? 0))
    .slice(0, maxCount)

  // ── Project to local metres ─────────────────────────────────────────────────
  const pts = panels.map((p) => {
    const { x, z } = project(p.center!.latitude, p.center!.longitude, centerLat, centerLng)
    return { x, z, landscape: p.orientation === 'LANDSCAPE', seg: p.segmentIndex ?? 0 }
  })

  const xs = pts.map((p) => p.x)
  const zs = pts.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const extX = Math.max(maxX - minX, 8)
  const extZ = Math.max(maxZ - minZ, 8)
  const cX = (minX + maxX) / 2
  const cZ = (minZ + maxZ) / 2

  // Normalise so longest axis = 3.6 world units
  const WORLD = 3.6
  const scale = WORLD / Math.max(extX, extZ)

  const norm = pts.map((p) => ({
    ...p,
    nx: (p.x - cX) * scale,
    nz: (p.z - cZ) * scale,
  }))

  const wX = extX * scale
  const wZ = extZ * scale
  const PANEL_W = 1.045 * scale
  const PANEL_D = 1.879 * scale
  const PANEL_T = 0.022 // panel thickness in world units (constant, independent of scale)

  // ── Roof deck ───────────────────────────────────────────────────────────────
  const pad = PANEL_D * 1.4
  const roofW = wX + pad * 2
  const roofD = wZ + pad * 2

  const roofGeo = new THREE.PlaneGeometry(roofW, roofD)
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1b2029 })
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.rotation.x = -Math.PI / 2
  roofMesh.position.y = 0
  roofMesh.receiveShadow = true
  scene.add(roofMesh)

  // Roof edge trim (thin border)
  const trimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(roofW, 0.01, roofD))
  const trimMat = new THREE.LineBasicMaterial({ color: 0x2e3848, linewidth: 1 })
  const trim = new THREE.LineSegments(trimGeo, trimMat)
  trim.position.y = 0.005
  scene.add(trim)

  // ── Building parapet ────────────────────────────────────────────────────────
  const WALL_H = WORLD * 0.18
  const wallGeo = new THREE.BoxGeometry(roofW, WALL_H, roofD)
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x121620 })
  const wallMesh = new THREE.Mesh(wallGeo, wallMat)
  wallMesh.position.y = -WALL_H / 2
  wallMesh.castShadow = true
  wallMesh.receiveShadow = true
  scene.add(wallMesh)

  // Parapet cap (thin bright strip at top of walls)
  const capGeo = new THREE.BoxGeometry(roofW + 0.06, 0.035, roofD + 0.06)
  const capMat = new THREE.MeshLambertMaterial({ color: 0x252d3a })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.y = -0.015
  scene.add(cap)

  // ── Solar panels (InstancedMesh for perf) ───────────────────────────────────
  const pGeo = new THREE.BoxGeometry(PANEL_W, PANEL_T, PANEL_D)
  // Top face (index 4) gets the dark panel colour; sides get a slightly lighter edge
  const pFaceMat = new THREE.MeshLambertMaterial({ color: 0x070a10 })
  const mesh = new THREE.InstancedMesh(pGeo, pFaceMat, norm.length)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const dummy = new THREE.Object3D()
  for (let i = 0; i < norm.length; i++) {
    const p = norm[i]
    dummy.position.set(p.nx, PANEL_T / 2 + 0.002, p.nz)
    dummy.rotation.y = p.landscape ? Math.PI / 2 : 0
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  scene.add(mesh)

  // Panel grid lines (sample every 4th panel to keep it light)
  addPanelGridLines(THREE, scene, norm, PANEL_W, PANEL_D, PANEL_T)

  // ── Ground shadow plane ──────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(roofW + 6, roofD + 6)
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -WALL_H
  ground.receiveShadow = true
  scene.add(ground)
}

function addPanelGridLines(
  THREE: ThreeMod,
  scene: InstanceType<ThreeMod['Scene']>,
  panels: { nx: number; nz: number; landscape: boolean }[],
  pw: number,
  pd: number,
  pt: number,
) {
  // Draw cell-divider lines on a random sample of panels for texture
  const stride = Math.max(1, Math.ceil(panels.length / 180))
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1a2438, transparent: true, opacity: 0.7 })

  for (let i = 0; i < panels.length; i += stride) {
    const p = panels[i]
    const hw = pw / 2
    const hd = pd / 2
    const y = pt + 0.003

    // Horizontal mid-line
    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, y, 0),
      new THREE.Vector3(hw, y, 0),
    ])
    const hLine = new THREE.Line(hGeo, lineMat)
    hLine.position.set(p.nx, 0, p.nz)
    if (p.landscape) hLine.rotation.y = Math.PI / 2
    scene.add(hLine)

    // Vertical thirds
    for (const f of [-1 / 3, 1 / 3]) {
      const vGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(hw * f, y, -hd),
        new THREE.Vector3(hw * f, y, hd),
      ])
      const vLine = new THREE.Line(vGeo, lineMat)
      vLine.position.set(p.nx, 0, p.nz)
      if (p.landscape) vLine.rotation.y = Math.PI / 2
      scene.add(vLine)
    }
  }
}

function addPlaceholder(THREE: ThreeMod, scene: InstanceType<ThreeMod['Scene']>) {
  // Generic commercial flat roof with a 5×4 panel array when no Solar API data
  const roofGeo = new THREE.PlaneGeometry(4.2, 3.2)
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1b2029 })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.rotation.x = -Math.PI / 2
  scene.add(roof)

  const wallGeo = new THREE.BoxGeometry(4.2, 0.65, 3.2)
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x121620 })
  const wall = new THREE.Mesh(wallGeo, wallMat)
  wall.position.y = -0.325
  scene.add(wall)

  const PW = 0.55, PD = 0.99, PT = 0.022
  const pGeo = new THREE.BoxGeometry(PW, PT, PD)
  const pMat = new THREE.MeshLambertMaterial({ color: 0x070a10 })
  const mesh = new THREE.InstancedMesh(pGeo, pMat, 20)
  const dummy = new THREE.Object3D()
  const GAP = 0.08
  let idx = 0
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      dummy.position.set(
        col * (PW + GAP) - 2 * (PW + GAP),
        PT / 2 + 0.002,
        row * (PD + GAP) - 1.5 * (PD + GAP),
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(idx++, dummy.matrix)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  scene.add(mesh)
}
