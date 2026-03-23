import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface StarShaderProps {
  progressRef: React.MutableRefObject<number>
  focus: number
  targetRadius: number
  yOffset?: number
  zOffset?: number
  color1?: string
  color2?: string
  coronaColor?: string
}

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uCorona;
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

// Simplex 3D Noise 
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

float fbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 5; ++i) {
    v += a * snoise(x);
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 pos = vPosition * 2.0;
  
  // Create flowing noise pattern
  float n = fbm(pos + uTime * 0.15);
  n = (n + 1.0) * 0.5;
  
  // Add another layer of fast-moving noise for flares
  float n2 = fbm(pos * 3.0 - uTime * 0.3);
  n2 = (n2 + 1.0) * 0.5;
  
  // Combine noises
  float finalNoise = mix(n, n2, 0.4);
  
  // Create color gradient
  vec3 color = mix(uColor1, uColor2, finalNoise);
  
  // Add glow at the edges (Fresnel)
  vec3 viewDirection = vec3(0.0, 0.0, 1.0); // Simple view dir for a sphere centered
  float fresnel = dot(viewDirection, vNormal);
  fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
  fresnel = pow(fresnel, 2.0);
  
  color += uColor2 * fresnel * 1.5;
  
  // Add corona ring around the edge
  float corona = pow(fresnel, 4.0) * 0.8;
  color += uCorona * corona;
  
  gl_FragColor = vec4(color * 1.5, 1.0);
}
`

export function StarShader({
  progressRef,
  focus,
  targetRadius,
  yOffset = 0,
  zOffset = 0,
  color1 = '#ff2a00',
  color2 = '#ffc800',
  coronaColor = '#fde68a',
}: StarShaderProps) {
  const meshRef = useRef<THREE.Group>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  
  const uniforms = useRef({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(color1) },
    uColor2: { value: new THREE.Color(color2) },
    uCorona: { value: new THREE.Color(coronaColor) },
  })

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return
    const t = clock.getElapsedTime()
    const progress = progressRef.current

    materialRef.current.uniforms.uTime.value = t

    const distance = Math.abs(progress - focus)
    const influence = Math.max(0, 1 - distance)

    meshRef.current.visible = influence > 0.02
    meshRef.current.position.x = (focus - progress) * 6.2
    meshRef.current.position.y = yOffset + (1 - influence) * 0.9
    meshRef.current.position.z = -4.6 + zOffset - (1 - influence) * 2.8

    const scaleFactor = 0.58 + influence * 0.78
    meshRef.current.scale.setScalar((targetRadius / 3.0) * scaleFactor)
    
    meshRef.current.rotation.y = t * 0.1 + (1 - influence) * 0.35
    meshRef.current.rotation.z = Math.sin(t * 0.1 + focus) * 0.06
  })

  return (
    <group ref={meshRef}>
      {/* Central Star */}
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms.current}
          transparent={true}
        />
      </mesh>
    </group>
  )
}
