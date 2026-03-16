import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, useGLTF, Environment, useTexture, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
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
    const target = activeScene === 1 ? 1 : 0
    opacityRef.current = MathUtils.lerp(opacityRef.current, target, 0.055)
    basicMaterials.forEach((mat) => {
      mat.opacity = opacityRef.current
    })
    if (groupRef.current) {
      groupRef.current.visible = opacityRef.current > 0.01
      if (opacityRef.current > 0.01) groupRef.current.rotation.y += 0.00015
    }
  })

  return (
    <group ref={groupRef} scale={[400, 400, 400]} visible={false}>
      <primitive object={scene} />
    </group>
  )
}

function SingleAvatar({ orb, audioLevel }: { orb: Orb, audioLevel: number }) {
  const isConductor = orb.role === 'conductor'
  
  // Coordinate mapping
  const mappedX = (orb.x - 50) * 0.05
  const mappedY = -(orb.y - 50) * 0.05
  const mappedZ = isConductor ? 2 : orb.role === 'speaker' ? 1 : 0
  
  const baseColor = new THREE.Color(
    isConductor ? '#ffd700' : 
    orb.role === 'speaker' ? '#9682ff' : 
    '#ffffff'
  )

  const scale = 1 + audioLevel * 0.15
  const innerDiscRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (innerDiscRef.current) {
      innerDiscRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.15
      innerDiscRef.current.position.y = Math.sin(clock.elapsedTime * 1.5) * 0.02
    }
  })

  return (
    <group position={[mappedX, mappedY, mappedZ]} scale={scale}>
      <mesh>
        <sphereGeometry args={[0.26, 64, 64]} />
        <meshPhysicalMaterial 
          color={isConductor ? '#fffae6' : orb.role === 'speaker' ? '#f0ebff' : '#ffffff'}
          transmission={0.9}
          thickness={0.8}
          roughness={0.08}
          ior={1.45}
          reflectivity={0.5}
          transparent={true}
          opacity={0.4}
        />
      </mesh>

      <Suspense fallback={<mesh><circleGeometry args={[0.16, 32]} /><meshBasicMaterial color={baseColor} transparent opacity={0.5} /></mesh>}>
        <AvatarImage orb={orb} baseColor={baseColor} audioLevel={audioLevel} discRef={innerDiscRef} />
      </Suspense>
      
      <Sparkles 
        count={orb.isTalking ? 80 : 20}
        scale={orb.isTalking ? 1.2 : 0.6}
        size={orb.isTalking ? 3 : 1.5}
        speed={0.4 + audioLevel}
        opacity={0.3}
        color={baseColor}
      />
    </group>
  )
}

function AvatarImage({ orb, baseColor, audioLevel, discRef }: { orb: Orb, baseColor: THREE.Color, audioLevel: number, discRef: any }) {
  const texture = useTexture(orb.image || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
  
  return (
      <mesh ref={discRef}>
      <circleGeometry args={[0.16, 64]} />
      <meshStandardMaterial 
        map={orb.image ? texture : undefined}
        color={orb.image ? '#ffffff' : baseColor}
        emissive={baseColor}
        emissiveIntensity={0.5 + audioLevel * 2.5}
        side={THREE.DoubleSide}
        transparent
        opacity={0.88}
      />
    </mesh>
  )
}

function UserAvatars({ orbs, audioLevels }: { orbs: Orb[], audioLevels: Record<string, number> }) {
  return (
    <group>
      {orbs.map((orb) => (
        <SingleAvatar key={orb.id} orb={orb} audioLevel={audioLevels[orb.id] ?? 0} />
      ))}
    </group>
  )
}

function SceneContents({ activeScene = 0, orbs = [], audioLevels = {} }: { activeScene?: number, orbs: Orb[], audioLevels: Record<string, number> }) {
  const progressRef = useRef(0)
  const [loadedSecondStage, setLoadedSecondStage] = useState(false)
  const [loadedThirdStage, setLoadedThirdStage] = useState(false)

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
        ambientColor: '#6f86d6',
        ambientIntensity: 0.88,
        keyColor: '#8dd7ff',
        keyIntensity: 2.8,
        fillColor: '#9a7eff',
        fillIntensity: 1.95,
        rimColor: '#7de1ff',
        rimIntensity: 1.65,
      },
      {
        ambientColor: '#aeb4d8',
        ambientIntensity: 0.7,
        keyColor: '#c7deff',
        keyIntensity: 2.45,
        fillColor: '#ffc289',
        fillIntensity: 1.48,
        rimColor: '#b4fff2',
        rimIntensity: 1.28,
      },
    ],
    [],
  )

  useEffect(() => {
    const nextScene = clamp(Math.round(activeScene), 0, 2)
    if (nextScene >= 1 && !loadedSecondStage) setLoadedSecondStage(true)
    if (nextScene >= 2 && !loadedThirdStage) setLoadedThirdStage(true)

    gsap.to(progressRef, {
      current: nextScene,
      duration: 0.9,
      ease: 'power3.out',
      overwrite: 'auto',
    })
  }, [activeScene, loadedSecondStage, loadedThirdStage])

  useFrame(({ camera }) => {
    const p = progressRef.current
    const t = performance.now() * 0.001

    camera.position.x = Math.sin(t * 0.22 + p * 0.9) * 0.34
    camera.position.z = 7.1 - p * 0.38 + Math.cos(t * 0.17 + p) * 0.12
    camera.position.y = Math.sin(p * Math.PI) * 0.2 + Math.sin(t * 0.28 + p * 0.4) * 0.08
    camera.lookAt(0, Math.sin(t * 0.14) * 0.08, -5.25)

    const lowStage = p < 1 ? 0 : 1
    const highStage = p < 1 ? 1 : 2
    const mix = p < 1 ? p : p - 1

    const a = stageGrades[lowStage]
    const b = stageGrades[highStage]

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
    }

    if (fillLightRef.current) {
      fillLightRef.current.intensity = MathUtils.lerp(a.fillIntensity, b.fillIntensity, mix)
      colorARef.current.set(a.fillColor)
      colorBRef.current.set(b.fillColor)
      fillLightRef.current.color.copy(colorARef.current).lerp(colorBRef.current, mix)
    }

    if (rimLightRef.current) {
      rimLightRef.current.intensity = MathUtils.lerp(a.rimIntensity, b.rimIntensity, mix)
      colorARef.current.set(a.rimColor)
      colorBRef.current.set(b.rimColor)
      rimLightRef.current.color.copy(colorARef.current).lerp(colorBRef.current, mix)
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
        <StarShader progressRef={progressRef} focus={0} targetRadius={3.75} yOffset={-0.05} zOffset={0} />
      </Suspense>

      {loadedSecondStage && (
        <Suspense fallback={null}>
          <NebulaSkybox activeScene={activeScene} />
        </Suspense>
      )}

      {loadedThirdStage && (
        <Suspense fallback={null}>
          <HeroModel modelUrl={earthNightModel} progressRef={progressRef} focus={2} spinSpeed={0.028} targetRadius={6.6} yOffset={0.1} zOffset={1.95} />
        </Suspense>
      )}

      <Stars radius={82} depth={26} count={2800} factor={2.2} saturation={0} fade speed={0.34} />
      <Environment preset="night" />

      <UserAvatars orbs={orbs} audioLevels={audioLevels} />

      <EffectComposer>
        <Bloom intensity={0.82} luminanceThreshold={0.2} luminanceSmoothing={0.78} mipmapBlur />
        <Vignette eskil={false} offset={0.15} darkness={0.42} />
        <Noise premultiply opacity={0.007} blendFunction={BlendFunction.SOFT_LIGHT} />
      </EffectComposer>
    </>
  )
}

interface SpheresNebulaSceneProps {
  activeScene?: number
  orbs?: Orb[]
  audioLevels?: Record<string, number>
}

export default function SpheresNebulaScene({ activeScene = 0, orbs = [], audioLevels = {} }: SpheresNebulaSceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 7.1], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#020205']} />
        <SceneContents activeScene={activeScene} orbs={orbs} audioLevels={audioLevels} />
      </Canvas>
    </div>
  )
}

useGLTF.preload(solarSystemModel)
useGLTF.preload(earthNightModel)
useGLTF.preload(needSomeSpaceModel)
