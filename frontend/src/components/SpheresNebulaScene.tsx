import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Stars, useGLTF } from '@react-three/drei'
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import gsap from 'gsap'
import type { AmbientLight, Group, Object3D, PointLight } from 'three'
import { AdditiveBlending, Box3, Color, MathUtils, Sphere, Vector3 } from 'three'
import earthNightModel from '../assets/earth_night.glb'
import needSomeSpaceModel from '../assets/need_some_space.glb'
import solarSystemModel from '../assets/solar_system_animation.glb'
import starryNightModel from '../assets/starry_night.glb'

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
    const scale = MathUtils.clamp(targetRadius / radius, 0.35, 8)

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

function StarryConstellation({ active }: { active: boolean }) {
  const groupRef = useRef<Group>(null)

  const stars = useMemo(
    () => [
      { pos: [-3.2, 1.5, -6.8], size: 0.07, opacity: 0.78 },
      { pos: [-2.5, 0.9, -6.2], size: 0.05, opacity: 0.7 },
      { pos: [-1.9, 1.8, -6.5], size: 0.06, opacity: 0.74 },
      { pos: [-1.1, 1.2, -6.1], size: 0.05, opacity: 0.72 },
      { pos: [-0.2, 1.7, -6.7], size: 0.08, opacity: 0.84 },
      { pos: [0.9, 1.1, -6.3], size: 0.05, opacity: 0.68 },
      { pos: [1.8, 1.9, -6.6], size: 0.06, opacity: 0.75 },
      { pos: [2.6, 1.3, -6.4], size: 0.05, opacity: 0.7 },
      { pos: [3.3, 1.8, -6.9], size: 0.07, opacity: 0.8 },
      { pos: [-2.9, -0.8, -6.2], size: 0.05, opacity: 0.66 },
      { pos: [-1.7, -1.1, -6.4], size: 0.06, opacity: 0.72 },
      { pos: [-0.6, -0.7, -6.1], size: 0.05, opacity: 0.68 },
      { pos: [0.7, -1.0, -6.3], size: 0.06, opacity: 0.73 },
      { pos: [2.0, -0.9, -6.2], size: 0.05, opacity: 0.7 },
      { pos: [3.1, -0.6, -6.4], size: 0.06, opacity: 0.74 },
    ],
    [],
  )

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.visible = active
    groupRef.current.children.forEach((child, index) => {
      const pulse = 0.75 + Math.sin(t * (1.6 + index * 0.11)) * 0.25
      child.scale.setScalar(pulse)
    })
  })

  return (
    <group ref={groupRef} visible={active}>
      {stars.map((star, index) => (
        <Billboard key={index} position={star.pos as [number, number, number]}>
          <mesh>
            <circleGeometry args={[star.size, 24]} />
            <meshBasicMaterial color="#d9f1ff" transparent opacity={star.opacity} blending={AdditiveBlending} depthWrite={false} />
          </mesh>
        </Billboard>
      ))}
    </group>
  )
}

function SceneContents({ activeScene = 0 }: { activeScene?: number }) {
  const progressRef = useRef(0)
  const [loadedSecondStage, setLoadedSecondStage] = useState(false)
  const [loadedThirdStage, setLoadedThirdStage] = useState(false)
  const touchLastYRef = useRef<number | null>(null)

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

    if (nextScene >= 1 && !loadedSecondStage) {
      setLoadedSecondStage(true)
    }
    if (nextScene >= 2 && !loadedThirdStage) {
      setLoadedThirdStage(true)
    }

    gsap.to(progressRef, {
      current: nextScene,
      duration: 0.9,
      ease: 'power3.out',
      overwrite: 'auto',
    })
  }, [activeScene, loadedSecondStage, loadedThirdStage])

  useEffect(() => {
    const animateProgress = (deltaY: number) => {
      const next = clamp(progressRef.current + deltaY * 0.0016, 0, 2)

      gsap.to(progressRef, {
        current: next,
        duration: 0.9,
        ease: 'power3.out',
        overwrite: 'auto',
        onUpdate: () => {
          if (progressRef.current > 0.28 && !loadedSecondStage) {
            setLoadedSecondStage(true)
          }
          if (progressRef.current > 1.05 && !loadedThirdStage) {
            setLoadedThirdStage(true)
          }
        },
      })
    }

    const handleWheel = (event: WheelEvent) => {
      animateProgress(event.deltaY)
    }

    const handleTouchStart = (event: TouchEvent) => {
      touchLastYRef.current = event.touches[0]?.clientY ?? null
    }

    const handleTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY
      if (currentY == null) return
      const previousY = touchLastYRef.current
      if (previousY == null) {
        touchLastYRef.current = currentY
        return
      }

      const delta = previousY - currentY
      touchLastYRef.current = currentY
      animateProgress(delta * 1.9)
    }

    const handleTouchEnd = () => {
      touchLastYRef.current = null
    }

    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [loadedSecondStage, loadedThirdStage])

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
      </Suspense>

      {loadedSecondStage && (
        <Suspense fallback={null}>
          <HeroModel modelUrl={starryNightModel} progressRef={progressRef} focus={1} spinSpeed={0.019} targetRadius={4.95} yOffset={-0.01} zOffset={1.1} />
        </Suspense>
      )}

      {loadedThirdStage && (
        <Suspense fallback={null}>
          <HeroModel modelUrl={earthNightModel} progressRef={progressRef} focus={2} spinSpeed={0.028} targetRadius={6.6} yOffset={0.1} zOffset={1.95} />
        </Suspense>
      )}

      {activeScene !== 1 && <Stars radius={82} depth={26} count={2800} factor={2.2} saturation={0} fade speed={0.34} />}
      <StarryConstellation active={activeScene === 1} />

      <EffectComposer>
        <Bloom intensity={0.82} luminanceThreshold={0.2} luminanceSmoothing={0.78} mipmapBlur />
        <Vignette eskil={false} offset={0.15} darkness={0.42} />
        <Noise premultiply opacity={0.007} blendFunction={BlendFunction.SOFT_LIGHT} />
      </EffectComposer>
    </>
  )
}

export default function SpheresNebulaScene({ activeScene = 0 }: { activeScene?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas dpr={[1, 1.4]} camera={{ position: [0, 0, 7.1], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#020205']} />
        <fog attach="fog" args={['#070512', 5, 19]} />
        <SceneContents activeScene={activeScene} />
      </Canvas>
    </div>
  )
}

useGLTF.preload(solarSystemModel)
useGLTF.preload(starryNightModel)
useGLTF.preload(earthNightModel)
useGLTF.preload(needSomeSpaceModel)
