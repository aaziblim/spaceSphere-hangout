import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, useGLTF, Environment, useTexture, Text, Billboard } from '@react-three/drei'

import gsap from 'gsap'
import * as THREE from 'three'
import type { AmbientLight, Group, Object3D, PointLight } from 'three'
import { BackSide, Box3, Color, MathUtils, MeshBasicMaterial, Sphere, Vector3 } from 'three'
import earthNightModel from '../assets/earth_night.glb'
import needSomeSpaceModel from '../assets/need_some_space.glb'
import solarSystemModel from '../assets/solar_system_animation.glb'
import { StarShader } from './StarShader'
import spaceNebulaModel from '../assets/space_nebula_hdri_panorama_360_skydome.glb'

interface Orb {
  id: string
  username: string
  image: string | null
  x: number
  y: number
  targetX: number
  targetY: number
  vx: number
  vy: number
  radius: number
  isTalking: boolean
  isSelf?: boolean
  role?: 'conductor' | 'speaker' | 'listener'
  handRaised?: boolean
  leaving?: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

interface HeroModelProps {
  modelUrl: string
  progressRef: React.MutableRefObject<number>
  focus: number
  spinSpeed: number
  targetRadius: number
  yOffset?: number
  zOffset?: number
}

function HeroModel({ modelUrl, progressRef, focus, spinSpeed, targetRadius, yOffset = 0, zOffset = 0 }: HeroModelProps) {
  const modelRef = useRef<Group>(null)
  const gltf = useGLTF(modelUrl)
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene])

  const { center, normalizedScale } = useMemo(() => {
    const bbox = new Box3().setFromObject(scene)
    const bboxSphere = bbox.getBoundingSphere(new Sphere())
    const modelCenter = new Vector3()
    bbox.getCenter(modelCenter)

    const radius = Math.max(bboxSphere.radius, 0.001)
    const scale = MathUtils.clamp(targetRadius / radius, 0.35, 20)

    return {
      center: modelCenter,
      normalizedScale: scale,
    }
  }, [scene, targetRadius])

  useMemo(() => {
    scene.traverse((child: Object3D) => {
      child.castShadow = false
      child.receiveShadow = false
    })
  }, [scene])

  useFrame(({ clock }) => {
    if (!modelRef.current) return
    const t = clock.getElapsedTime()
    const progress = progressRef.current

    const distance = Math.abs(progress - focus)
    const influence = clamp(1 - distance, 0, 1)

    modelRef.current.visible = influence > 0.02
    modelRef.current.position.x = (focus - progress) * 6.2
    modelRef.current.position.y = yOffset + (1 - influence) * 0.9
    modelRef.current.position.z = -4.6 + zOffset - (1 - influence) * 2.8

    const scaleFactor = 0.58 + influence * 0.78
    modelRef.current.scale.setScalar(normalizedScale * scaleFactor)

    modelRef.current.rotation.y = t * spinSpeed + (1 - influence) * 0.35
    modelRef.current.rotation.z = Math.sin(t * 0.1 + focus) * 0.06
  })

  return (
    <group ref={modelRef}>
      <primitive object={scene} position={[-center.x, -center.y, -center.z]} />
    </group>
  )
}

function NebulaSkybox({ activeScene }: { activeScene: number }) {
  const groupRef = useRef<Group>(null)
  const gltf = useGLTF(spaceNebulaModel)
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene])
  const opacityRef = useRef(0)

  const basicMaterials = useMemo(() => {
    const mats: MeshBasicMaterial[] = []
    scene.traverse((child: Object3D) => {
      const mesh = child as any
      if (mesh.isMesh) {
        const oldMats: any[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const newMats = oldMats.map((old: any) => {
          const basic = new MeshBasicMaterial({
            map: old.map ?? null,
            color: old.color ?? new Color(1, 1, 1),
            side: BackSide,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0,
            fog: false,
          })
          mats.push(basic)
          return basic
        })
        mesh.material = newMats.length === 1 ? newMats[0] : newMats
        mesh.renderOrder = -100
      }
    })
    return mats
  }, [scene])

  useFrame(() => {
    const target = activeScene === 1 ? 1 : activeScene === 2 ? 0.45 : 0
    opacityRef.current = MathUtils.lerp(opacityRef.current, target, 0.12)
    basicMaterials.forEach((mat) => {
      mat.opacity = opacityRef.current
    })
    if (groupRef.current) {
      groupRef.current.visible = opacityRef.current > 0.01
      if (opacityRef.current > 0.01) groupRef.current.rotation.y += activeScene === 1 ? 0.0004 : 0.00025
    }
  })

  return (
    <group ref={groupRef} scale={[210, 210, 210]} visible={false}>
      <primitive object={scene} />
    </group>
  )
}

function AvatarImage({ orb, isMuted }: { orb: Orb, isMuted: boolean }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    const defaultImageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    const loader = new THREE.TextureLoader()
    const url = orb.image || defaultImageUrl
    
    loader.load(
      url,
      (loaded) => setTexture(loaded),
      undefined,
      () => loader.load(defaultImageUrl, setTexture)
    )
  }, [orb.image])

  return (
    <mesh>
      <circleGeometry args={[0.24, 64]} />
      {texture ? (
        <meshBasicMaterial 
          map={texture} 
          transparent 
          opacity={isMuted ? 0.35 : 1.0} 
          color={isMuted ? '#aaaaaa' : '#ffffff'}
        />
      ) : (
        <meshBasicMaterial color="#333333" />
      )}
    </mesh>
  )
}

function AppleSpatialAvatar({ orb, audioLevel, totalUsers = 1 }: { orb: Orb, audioLevel: number, totalUsers?: number }) {
  const isConductor = orb.role === 'conductor'
  const isTalking = orb.isTalking || audioLevel > 0.05
  const isMuted = !isTalking && audioLevel <= 0.01
  
  // Coordinate mapping (closer to center for hosts)
  const distScale = totalUsers > 30 ? 0.03 : 0.05
  const conductorBonus = isConductor ? 0.8 : 1.0
  const mappedX = (orb.x - 50) * distScale * conductorBonus
  const mappedY = -(orb.y - 50) * distScale * conductorBonus
  const mappedZ = isConductor ? 2 : orb.role === 'speaker' ? 1 : 0
  
  const baseHex = isConductor ? '#ffd700' : orb.role === 'speaker' ? '#9682ff' : '#a2bbff'
  const targetColor = useMemo(() => new THREE.Color(baseHex), [baseHex])

  const groupRef = useRef<THREE.Group>(null)
  const targetPos = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    targetPos.set(mappedX, mappedY, mappedZ)

    if (groupRef.current) {
      // Smooth physical inertia based on backend socket positions
      groupRef.current.position.lerp(targetPos, MathUtils.clamp(delta * 4.0, 0, 1))

      // Orbital & float logic
      const t = state.clock.elapsedTime
      if (isTalking) {
        // Active speakers have an energetic float
        groupRef.current.position.y += Math.sin(t * 3.0 + mappedX) * 0.005
        groupRef.current.position.x += Math.cos(t * 2.0 + mappedY) * 0.005
      } else {
        // Silent users have a very slow, static drift
        groupRef.current.position.y += Math.sin(t * 0.5 + mappedX) * 0.001
      }
    }
  })

  // Dynamic scale for crowd density
  const dynamicScale = totalUsers > 30 ? 0.7 : totalUsers > 15 ? 0.85 : 1.0

  return (
    <group ref={groupRef} position={[mappedX, mappedY, mappedZ]} scale={dynamicScale}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        
        {/* Glow Halo - pulses when speaking */}
        <mesh position={[0, 0, -0.01]}>
          <ringGeometry args={[0.26, 0.28 + (isTalking ? audioLevel * 0.2 : 0), 32]} />
          <meshBasicMaterial 
            color={targetColor} 
            transparent 
            opacity={isTalking ? 0.8 + audioLevel * 0.2 : 0.15} 
          />
        </mesh>
        
        {/* Optional gentle inner glow when speaking */}
        {isTalking && (
          <mesh position={[0, 0, -0.02]}>
            <circleGeometry args={[0.35 + audioLevel * 0.3, 32]} />
            <meshBasicMaterial 
              color={targetColor} 
              transparent 
              opacity={audioLevel * 0.3} 
            />
          </mesh>
        )}
        
        {/* 2D Circle Avatar Plane */}
        <AvatarImage orb={orb} isMuted={isMuted} />
        
        {/* Muted Icon */}
        {isMuted && (
          <Text
            position={[0.18, -0.18, 0.02]}
            fontSize={0.12}
            color="#ff5555"
            anchorX="center"
            anchorY="middle"
          >
            🔇
          </Text>
        )}
        
        {/* Host Crown */}
        {isConductor && (
          <Text
            position={[0, 0.35, 0.01]}
            fontSize={0.18}
            anchorX="center"
            anchorY="middle"
          >
            👑
          </Text>
        )}
        
        {/* Name Tag */}
        <Text
          position={[0, -0.4, 0]}
          fontSize={0.10}
          fontWeight="bold"
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {(orb.username || 'User').toUpperCase()}
        </Text>
        
      </Billboard>
    </group>
  )
}

function UserAvatars({ orbs, audioLevels }: { orbs: Orb[], audioLevels: Record<string, number> }) {
  return (
    <group>
      {orbs.map((orb) => (
        <AppleSpatialAvatar 
          key={orb.id} 
          orb={orb} 
          audioLevel={audioLevels[orb.id] ?? 0} 
          totalUsers={orbs.length} 
        />
      ))}
    </group>
  )
}

function SceneFallbackOrb({ color = '#6b7cff' }: { color?: string }) {
  return (
    <mesh position={[0, 0, -4.2]}>
      <sphereGeometry args={[1.2, 28, 28]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} />
    </mesh>
  )
}

function SceneContents({ activeScene = 0, orbs = [], audioLevels = {} }: { activeScene?: number, orbs: Orb[], audioLevels: Record<string, number> }) {
  const progressRef = useRef(0)
  const [loadedSecondStage] = useState(true)
  const [loadedThirdStage] = useState(true)

  const ambientRef = useRef<AmbientLight>(null)
  const keyLightRef = useRef<PointLight>(null)
  const fillLightRef = useRef<PointLight>(null)
  const rimLightRef = useRef<PointLight>(null)

  const colorARef = useRef(new Color())
  const colorBRef = useRef(new Color())

  const stageGrades = useMemo(
    () => [
      {
        ambientColor: '#8da1ff',
        ambientIntensity: 0.6,
        keyColor: '#88b9ff',
        keyIntensity: 2.1,
        fillColor: '#ff7ac5',
        fillIntensity: 1.25,
        rimColor: '#7df7e1',
        rimIntensity: 1.15,
      },
      {
        ambientColor: '#4f5ca8',
        ambientIntensity: 1.08,
        keyColor: '#73c9ff',
        keyIntensity: 3.5,
        fillColor: '#8e67ff',
        fillIntensity: 2.45,
        rimColor: '#57e8ff',
        rimIntensity: 2.05,
      },
      {
        ambientColor: '#8fa5d8',
        ambientIntensity: 0.92,
        keyColor: '#bfd8ff',
        keyIntensity: 3.15,
        fillColor: '#ffb16e',
        fillIntensity: 2.0,
        rimColor: '#7fd9ff',
        rimIntensity: 1.9,
      },
    ],
    [],
  )

  const starsSaturation = activeScene === 1 ? 0.65 : activeScene === 2 ? 0.35 : 0

  useEffect(() => {
    const nextScene = clamp(Math.round(activeScene), 0, 2)
    gsap.to(progressRef, {
      current: nextScene,
      duration: 0.9,
      ease: 'power3.out',
      overwrite: 'auto',
    })
  }, [activeScene])

  useFrame(({ camera }) => {
    const rawProgress = progressRef.current
    const p = Number.isFinite(rawProgress) ? clamp(rawProgress, 0, 2) : 0
    const t = performance.now() * 0.001

    const camStages = [
      { x: 0.0, y: 0.05, z: 7.1, lookY: 0.02, lookZ: -4.9, fov: 41, driftX: 0.2, driftY: 0.05, driftZ: 0.06 },
      { x: 0.12, y: 0.16, z: 6.4, lookY: 0.08, lookZ: -3.55, fov: 37, driftX: 0.16, driftY: 0.04, driftZ: 0.04 },
      { x: -0.05, y: 0.2, z: 5.95, lookY: 0.1, lookZ: -2.25, fov: 35, driftX: 0.12, driftY: 0.03, driftZ: 0.03 },
    ] as const

    const lowStage = p < 1 ? 0 : 1
    const highStage = p < 1 ? 1 : 2
    const mix = p < 1 ? p : p - 1

    const a = stageGrades[lowStage]
    const b = stageGrades[highStage]
    const ca = camStages[lowStage]
    const cb = camStages[highStage]

    const cx = MathUtils.lerp(ca.x, cb.x, mix)
    const cy = MathUtils.lerp(ca.y, cb.y, mix)
    const cz = MathUtils.lerp(ca.z, cb.z, mix)
    const driftX = MathUtils.lerp(ca.driftX, cb.driftX, mix)
    const driftY = MathUtils.lerp(ca.driftY, cb.driftY, mix)
    const driftZ = MathUtils.lerp(ca.driftZ, cb.driftZ, mix)

    camera.position.x = cx + Math.sin(t * 0.24 + p * 0.85) * driftX
    camera.position.z = cz + Math.cos(t * 0.18 + p * 1.1) * driftZ
    camera.position.y = cy + Math.sin(t * 0.3 + p * 0.55) * driftY

    const lookY = MathUtils.lerp(ca.lookY, cb.lookY, mix) + Math.sin(t * 0.14 + p) * 0.018
    const lookZ = MathUtils.lerp(ca.lookZ, cb.lookZ, mix)
    camera.lookAt(0, lookY, lookZ)

    const nextFov = MathUtils.lerp(ca.fov, cb.fov, mix)
    if ('fov' in camera) {
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      if (Math.abs(perspectiveCamera.fov - nextFov) > 0.01) {
        perspectiveCamera.fov = nextFov
        perspectiveCamera.updateProjectionMatrix()
      }
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, mix)
      colorARef.current.set(a.ambientColor)
      colorBRef.current.set(b.ambientColor)
      ambientRef.current.color.copy(colorARef.current).lerp(colorBRef.current, mix)
    }

    if (keyLightRef.current) {
      keyLightRef.current.intensity = MathUtils.lerp(a.keyIntensity, b.keyIntensity, mix)
      colorARef.current.set(a.keyColor)
      colorBRef.current.set(b.keyColor)
      keyLightRef.current.color.copy(colorARef.current).lerp(colorBRef.current, mix)
      keyLightRef.current.position.x = 2.8 + Math.sin(t * 0.35 + p) * 1.1
      keyLightRef.current.position.y = 1.8 + Math.cos(t * 0.28 + p) * 0.8
      keyLightRef.current.position.z = 3.6 + Math.cos(t * 0.22 + p) * 0.6
    }

    if (fillLightRef.current) {
      fillLightRef.current.intensity = MathUtils.lerp(a.fillIntensity, b.fillIntensity, mix)
      colorARef.current.set(a.fillColor)
      colorBRef.current.set(b.fillColor)
      fillLightRef.current.color.copy(colorARef.current).lerp(colorBRef.current, mix)
      fillLightRef.current.position.x = -3.2 + Math.cos(t * 0.31 + p * 0.6) * 0.95
      fillLightRef.current.position.y = -0.7 + Math.sin(t * 0.33 + p) * 0.7
      fillLightRef.current.position.z = 2.8 + Math.sin(t * 0.27 + p) * 0.6
    }

    if (rimLightRef.current) {
      rimLightRef.current.intensity = MathUtils.lerp(a.rimIntensity, b.rimIntensity, mix)
      colorARef.current.set(a.rimColor)
      colorBRef.current.set(b.rimColor)
      rimLightRef.current.color.copy(colorARef.current).lerp(colorBRef.current, mix)
      rimLightRef.current.position.x = 0.4 + Math.sin(t * 0.4 + p * 1.2) * 0.85
      rimLightRef.current.position.y = -2.2 + Math.cos(t * 0.25 + p * 0.9) * 0.7
      rimLightRef.current.position.z = 3.2 + Math.sin(t * 0.18 + p) * 0.65
    }
  })

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.6} color="#8da1ff" />
      <pointLight ref={keyLightRef} intensity={2.1} color="#88b9ff" position={[2.8, 1.8, 3.6]} />
      <pointLight ref={fillLightRef} intensity={1.25} color="#ff7ac5" position={[-3.2, -0.7, 2.8]} />
      <pointLight ref={rimLightRef} intensity={1.15} color="#7df7e1" position={[0.4, -2.2, 3.2]} />

      <Suspense fallback={null}>
        <HeroModel modelUrl={solarSystemModel} progressRef={progressRef} focus={0} spinSpeed={0.012} targetRadius={3.75} yOffset={-0.05} zOffset={0} />
        <StarShader progressRef={progressRef} focus={0} targetRadius={3.75} yOffset={-0.05} zOffset={0} color1="#ff2a00" color2="#ffc800" coronaColor="#fde68a" />
      </Suspense>

      {loadedSecondStage && (
        <Suspense fallback={<SceneFallbackOrb color="#7c3aed" />}>
          <NebulaSkybox activeScene={activeScene} />
          <HeroModel modelUrl={needSomeSpaceModel} progressRef={progressRef} focus={1} spinSpeed={0.009} targetRadius={5.5} yOffset={0.04} zOffset={0.9} />
          <StarShader
            progressRef={progressRef}
            focus={1}
            targetRadius={4.6}
            yOffset={0.04}
            zOffset={0.9}
            color1="#7c3aed"
            color2="#22d3ee"
            coronaColor="#a78bfa"
          />
        </Suspense>
      )}

      {loadedThirdStage && (
        <Suspense fallback={<SceneFallbackOrb color="#60a5fa" />}>
          <HeroModel modelUrl={earthNightModel} progressRef={progressRef} focus={2} spinSpeed={0.012} targetRadius={7.6} yOffset={0.2} zOffset={2.4} />
          <StarShader
            progressRef={progressRef}
            focus={2}
            targetRadius={7.1}
            yOffset={0.2}
            zOffset={2.4}
            color1="#22d3ee"
            color2="#f97316"
            coronaColor="#fde68a"
          />
        </Suspense>
      )}

      <Stars radius={82} depth={26} count={2800} factor={2.6} saturation={starsSaturation} fade speed={0.34} />
      <Environment preset="night" />

      <UserAvatars orbs={orbs} audioLevels={audioLevels} />

      {/* Removed EffectComposer to fix crash */}
    </>
  )
}

interface SpheresNebulaSceneProps {
  activeScene?: number
  orbs?: Orb[]
  audioLevels?: Record<string, number>
}

export default function SpheresNebulaScene({ activeScene = 0, orbs = [], audioLevels = {} }: SpheresNebulaSceneProps) {
  const bg =
    activeScene === 1 ? '#0b0325' : activeScene === 2 ? '#050611' : '#020205'
  const [contextLost, setContextLost] = useState(false)

  return (
    <div className="absolute inset-0 pointer-events-none">
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.15em] uppercase text-white/60 bg-black/40 backdrop-blur-sm">
          Reinitializing 3D Scene...
        </div>
      )}
      <Canvas
        dpr={[1, 1.2]}
        camera={{ position: [0, 0, 7.1], fov: 42 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement
          canvas.addEventListener(
            'webglcontextlost',
            (event) => {
              event.preventDefault()
              setContextLost(true)
            },
            false,
          )
          canvas.addEventListener(
            'webglcontextrestored',
            () => {
              setContextLost(false)
            },
            false,
          )
        }}
      >
        <color attach="background" args={[bg]} />
        <SceneContents activeScene={activeScene} orbs={orbs} audioLevels={audioLevels} />
      </Canvas>
    </div>
  )
}

useGLTF.preload(solarSystemModel)
useGLTF.preload(earthNightModel)
useGLTF.preload(needSomeSpaceModel)
