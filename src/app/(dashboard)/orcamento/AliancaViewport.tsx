"use client";

import React, { Suspense, useMemo, useRef, useEffect, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows, Text } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ProfileType } from "./types";
import type { RingParams } from "./types";
import { applyGroove, buildAnatomicaProfile, LATHE_ANGULAR_SEGMENTS } from "./ring-geometry";

// Environment local — gera PMREM a partir do RoomEnvironment do Three.js (sem
// dependência de CDN). Sem isso, material com metalness=1 + roughness=0 fica
// preto porque não tem nada para refletir.
function StudioEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const previous = scene.environment;
    // react-hooks/immutability: scene vem de useThree e é mutável intencionalmente em hooks r3f
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = envTex;
    return () => {
      scene.environment = previous;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// ── Ring Mesh ────────────────────────────────────────────────────────────────

function Ring({
  params,
  profileType,
  onSetMesh,
}: {
  params: RingParams;
  profileType: ProfileType;
  onSetMesh: (mesh: THREE.Mesh | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const rIn = params.diameter / 2;
    const wH = params.width / 2;
    const h = params.height;
    let pts: THREE.Vector2[] = [];

    switch (profileType) {
      case ProfileType.Concava: {
        const rOut = rIn + h;
        const depth = Math.min(params.concaveDepth, h - 0.1);
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rOut, -wH));
        const curve = new THREE.QuadraticBezierCurve(
          new THREE.Vector2(rOut, -wH),
          new THREE.Vector2(rOut - depth, 0),
          new THREE.Vector2(rOut, wH)
        );
        pts.push(...curve.getPoints(24));
        pts.push(new THREE.Vector2(rIn, wH));
        break;
      }
      case ProfileType.QuadradoCanal: {
        const rOut = rIn + h;
        const rCanal = rIn + params.canalBorderHeight;
        const cW2 = params.canalWidth / 2;
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rOut, -wH));
        pts.push(new THREE.Vector2(rOut, -cW2));
        pts.push(new THREE.Vector2(rCanal, -cW2));
        pts.push(new THREE.Vector2(rCanal, cW2));
        pts.push(new THREE.Vector2(rOut, cW2));
        pts.push(new THREE.Vector2(rOut, wH));
        pts.push(new THREE.Vector2(rIn, wH));
        break;
      }
      case ProfileType.Boleada: {
        const domeFactor = Math.max(0, Math.min(1, params.domePercentage / 100));
        const edgeThickness = h * (1 - domeFactor);
        const amplitude = h - edgeThickness;
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rIn + edgeThickness, -wH));
        const segments = 64;
        for (let i = 1; i < segments; i++) {
          const ratio = i / segments;
          const y = -wH + params.width * ratio;
          const normY = 2 * ratio - 1;
          const xOffset = Math.sqrt(Math.max(0, 1 - normY * normY)) * amplitude;
          pts.push(new THREE.Vector2(rIn + edgeThickness + xOffset, y));
        }
        pts.push(new THREE.Vector2(rIn + edgeThickness, wH));
        pts.push(new THREE.Vector2(rIn, wH));
        break;
      }
      case ProfileType.BoleadaDouble: {
        const xc = rIn + h / 2;
        const amplitude = (h / 2) * (params.domePercentage / 100);
        const edgeOffset = h / 2 - amplitude;
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
          const ratio = i / segments;
          const y = -wH + params.width * ratio;
          const normY = 2 * ratio - 1;
          const xOff = Math.sqrt(Math.max(0, 1 - normY * normY)) * amplitude;
          pts.push(new THREE.Vector2(xc + edgeOffset + xOff, y));
        }
        for (let i = 0; i <= segments; i++) {
          const ratio = i / segments;
          const y = wH - params.width * ratio;
          const normY = 1 - 2 * ratio;
          const xOff = Math.sqrt(Math.max(0, 1 - normY * normY)) * amplitude;
          pts.push(new THREE.Vector2(xc - edgeOffset - xOff, y));
        }
        pts.push(new THREE.Vector2(xc + edgeOffset, -wH));
        break;
      }
      case ProfileType.Anatomica: {
        // Molde compartilhado com o cálculo de peso (ring-geometry.ts) —
        // peça na tela e peso calculado vêm sempre da mesma fonte.
        pts = buildAnatomicaProfile(params);
        break;
      }
      case ProfileType.Chanfrada: {
        const rOut = rIn + h;
        const c = Math.min(params.chamferSize, h, params.width / 2);
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rOut - c, -wH));
        pts.push(new THREE.Vector2(rOut, -wH + c));
        pts.push(new THREE.Vector2(rOut, wH - c));
        pts.push(new THREE.Vector2(rOut - c, wH));
        pts.push(new THREE.Vector2(rIn, wH));
        break;
      }
      default: {
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rIn + h, -wH));
        pts.push(new THREE.Vector2(rIn + h, wH));
        pts.push(new THREE.Vector2(rIn, wH));
        break;
      }
    }

    // Aplica groove em qualquer perfil quando habilitado
    if (params.hasGroove) {
      pts = applyGroove(pts, params, rIn, wH);
    }

    if (
      profileType !== ProfileType.Anatomica &&
      profileType !== ProfileType.BoleadaDouble
    ) {
      pts.push(new THREE.Vector2(rIn, -wH));
    }

    let geo: THREE.BufferGeometry = new THREE.LatheGeometry(pts, LATHE_ANGULAR_SEGMENTS);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    return geo;
  }, [params, profileType]);

  // Memory leak fix: BufferGeometry mantida pelo useMemo nao eh liberada
  // automaticamente pelo R3F quando a referencia muda. Sem este cleanup,
  // sessoes longas de orcamento (consultora 30min+ editando) acumulam
  // geometrias antigas na GPU.
  useEffect(() => {
    return () => { geometry.dispose(); };
  }, [geometry]);

  useEffect(() => {
    if (meshRef.current) onSetMesh(meshRef.current);
  }, [geometry, onSetMesh]);

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color={params.metalColor}
          roughness={0.0}
          metalness={1.0}
          envMapIntensity={4.5}
        />
      </mesh>
    </group>
  );
}

// ── Geometria de diamante corte brilhante (57 facetas aprox.) ────────────────
// Baseado nas proporções ideais GIA:
//   Mesa = 57% do diâmetro, Coroa = 16% da altura total, Pavilhão = 43%
//   Crown angle ~34°, Pavilion angle ~41°
// Estrutura: culet → pavilhão inferior → cintura → coroa estrela → mesa

function createDiamondGeometry(radius: number): THREE.BufferGeometry {
  const n = 8; // 8 lados = 16 facetas pavilhão + 8 estrela + 8 bezel + 16 upper girdle + 8 mesa = ~57
  const crownH = radius * 0.33;
  const pavilionH = radius * 0.60;
  const tableR = radius * 0.56;
  const girdleR = radius;
  const starR = radius * 0.72; // raio intermediário da estrela na coroa
  const lowerGirdleR = radius * 0.65; // anel intermediário do pavilhão

  const verts: number[] = [];
  const idx: number[] = [];
  let vi = 0;

  const addV = (x: number, y: number, z: number) => { verts.push(x, y, z); return vi++; };

  // 0: culet
  const culet = addV(0, -pavilionH, 0);

  // Pavilhão lower girdle (anel intermediário) — offset 1/2 faceta
  const pavLG: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    pavLG.push(addV(Math.cos(a) * lowerGirdleR, -pavilionH * 0.35, Math.sin(a) * lowerGirdleR));
  }

  // Cintura (girdle)
  const girdle: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    girdle.push(addV(Math.cos(a) * girdleR, 0, Math.sin(a) * girdleR));
  }

  // Coroa: estrela (star facets)
  const star: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2; // offset meio passo
    star.push(addV(Math.cos(a) * starR, crownH * 0.55, Math.sin(a) * starR));
  }

  // Mesa
  const table: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    table.push(addV(Math.cos(a) * tableR, crownH, Math.sin(a) * tableR));
  }

  // Centro da mesa
  const tableCenter = addV(0, crownH, 0);

  // ── Pavilhão: culet → lower girdle → girdle ──────────────────────
  for (let i = 0; i < n * 2; i++) {
    const next = (i + 1) % (n * 2);
    // Culet → lower girdle
    idx.push(culet, pavLG[next], pavLG[i]);
    // Lower girdle → girdle
    idx.push(pavLG[i], pavLG[next], girdle[next]);
    idx.push(pavLG[i], girdle[next], girdle[i]);
  }

  // ── Coroa: girdle → star → mesa ──────────────────────────────────
  for (let i = 0; i < n; i++) {
    const g0 = i * 2;
    const g1 = i * 2 + 1;
    const g2 = ((i + 1) * 2) % (n * 2);
    const si = star[i];
    const sNext = star[(i + 1) % n];
    const ti = table[i];
    const tNext = table[(i + 1) % n];

    // Bezel facets: girdle → star
    idx.push(girdle[g0], girdle[g1], si);
    idx.push(girdle[g1], girdle[g2], si);

    // Upper girdle → star → table
    idx.push(si, girdle[g2], sNext);
    idx.push(si, sNext, tNext);
    idx.push(si, tNext, ti);
  }

  // Mesa
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    idx.push(tableCenter, table[i], table[next]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ── Pedras cravadas na aliança ──────────────────────────────────────────────

function StonesCravadas({
  params,
  profile,
}: {
  params: RingParams;
  profile: ProfileType;
}) {
  const diamondGeo = useMemo(() => {
    if (!params.hasStones) return null;
    return createDiamondGeometry(params.stoneSize / 2);
  }, [params.hasStones, params.stoneSize]);

  // Memory leak fix: libera a geometria da pedra ao trocar/desmontar.
  useEffect(() => {
    return () => { diamondGeo?.dispose(); };
  }, [diamondGeo]);

  const stones = useMemo(() => {
    if (!params.hasStones) return [];

    const rIn = params.diameter / 2;
    const stoneSize = params.stoneSize;
    const stoneRadius = stoneSize / 2;

    // Raio da superfície externa
    const rSurface = profile === ProfileType.QuadradoCanal
      ? rIn + params.canalBorderHeight
      : rIn + params.height;

    // Pedra fica com a mesa ligeiramente acima da superfície
    const rStone = rSurface - stoneRadius * 0.20;

    // Quantidade de pedras por fileira
    const circumference = 2 * Math.PI * rSurface;
    const stoneSpace = profile === ProfileType.QuadradoCanal ? stoneSize : stoneSize + 0.2;
    const perRow = Math.floor(circumference / stoneSpace);

    const rows = profile === ProfileType.QuadradoCanal ? params.stoneRows : 1;

    let totalStones: number;
    if (params.stoneFull) {
      totalStones = perRow * rows;
    } else if (params.stoneHalfMoon) {
      totalStones = Math.floor((perRow * rows) / 2);
    } else {
      totalStones = params.stoneCount;
    }

    // Posições Y das fileiras
    const rowYPositions: number[] = [];
    if (profile === ProfileType.QuadradoCanal && rows > 1) {
      const canalW = params.canalWidth;
      for (let r = 0; r < rows; r++) {
        rowYPositions.push(-canalW / 2 + stoneSize / 2 + r * (canalW / rows));
      }
    } else {
      rowYPositions.push(0);
    }

    const result: Array<{ position: [number, number, number]; rotation: [number, number, number] }> = [];
    let placed = 0;

    for (const rowY of rowYPositions) {
      const angleStep = (2 * Math.PI) / perRow;
      const stonesInThisRow = Math.min(perRow, totalStones - placed);
      for (let i = 0; i < stonesInThisRow; i++) {
        const angle = i * angleStep;
        const x = Math.cos(angle) * rStone;
        const z = Math.sin(angle) * rStone;
        result.push({
          position: [x, rowY, z],
          // Orientar: pavilhão para dentro, mesa para fora (radial)
          rotation: [0, -angle, -Math.PI / 2],
        });
        placed++;
        if (placed >= totalStones) break;
      }
      if (placed >= totalStones) break;
    }

    return result;
  }, [params, profile]);

  // Garras: pequenas esferas douradas entre as pedras
  const prongs = useMemo(() => {
    if (stones.length <= 1) return [];
    const rIn = params.diameter / 2;
    const rSurface = profile === ProfileType.QuadradoCanal
      ? rIn + params.canalBorderHeight
      : rIn + params.height;
    const rProng = rSurface + params.stoneSize * 0.08; // ligeiramente acima da superfície
    const prongSize = params.stoneSize * 0.12; // tamanho da garra
    const stoneSpace = profile === ProfileType.QuadradoCanal ? params.stoneSize : params.stoneSize + 0.2;
    const circumference = 2 * Math.PI * rSurface;
    const perRow = Math.floor(circumference / stoneSpace);
    const rows = profile === ProfileType.QuadradoCanal ? params.stoneRows : 1;

    const rowYPositions: number[] = [];
    if (profile === ProfileType.QuadradoCanal && rows > 1) {
      for (let r = 0; r < rows; r++) {
        rowYPositions.push(-params.canalWidth / 2 + params.stoneSize / 2 + r * (params.canalWidth / rows));
      }
    } else {
      rowYPositions.push(0);
    }

    const result: Array<{ pos: [number, number, number]; size: number }> = [];
    for (const rowY of rowYPositions) {
      const angleStep = (2 * Math.PI) / perRow;
      for (let i = 0; i < perRow; i++) {
        // 4 garras por pedra nos cantos
        const baseAngle = i * angleStep;
        const halfStep = angleStep * 0.45;
        for (const offset of [-halfStep, halfStep]) {
          const a = baseAngle + offset;
          result.push({
            pos: [Math.cos(a) * rProng, rowY, Math.sin(a) * rProng],
            size: prongSize,
          });
        }
      }
    }
    return result;
  }, [params, profile, stones.length]);

  if (!diamondGeo || stones.length === 0) return null;

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Diamantes */}
      {stones.map((s, idx) => (
        <mesh key={`d${idx}`} geometry={diamondGeo} position={s.position} rotation={s.rotation}>
          <meshPhysicalMaterial
            color="#f0f4ff"
            metalness={0.0}
            roughness={0.0}
            transmission={0.15}
            thickness={3.0}
            ior={2.42}
            envMapIntensity={10.0}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
            reflectivity={1.0}
            specularIntensity={4.0}
            specularColor={new THREE.Color("#ffffff")}
          />
        </mesh>
      ))}
      {/* Garras douradas */}
      {prongs.map((p, idx) => (
        <mesh key={`p${idx}`} position={p.pos}>
          <sphereGeometry args={[p.size, 8, 8]} />
          <meshStandardMaterial
            color={params.metalColor}
            roughness={0.1}
            metalness={1.0}
            envMapIntensity={4.0}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── Engraving Text (inside ring — groove style) ─────────────────────────────

function EngravingText({
  text,
  fontType,
  diameter,
  width,
  metalColor,
}: {
  text: string;
  fontType: 1 | 2;
  diameter: number;
  width: number;
  metalColor: string;
}) {
  const rInner = diameter / 2;
  const fontSize = Math.min(width * 0.3, 1.2);
  const charCount = text.length;
  const spacing = fontSize * 0.6;
  const totalWidth = charCount * spacing;
  // Texto na superfície interna — ligeiramente dentro do raio interno
  const r = rInner - 0.05;
  const totalAngle = totalWidth / r;
  const startAngle = Math.PI / 2 - totalAngle / 2;

  // Cor escura simulando baixo relevo
  const grooveColor = useMemo(() => {
    const c = new THREE.Color(metalColor);
    c.multiplyScalar(0.25);
    return c;
  }, [metalColor]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {text.split("").map((char, i) => {
        const a = startAngle + (i + 0.5) * (totalAngle / charCount);
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;
        // Letra olha para o centro (legível de fora através do anel)
        return (
          <Text
            key={`${i}-${char}`}
            position={[px, 0, pz]}
            rotation={[0, -(a + Math.PI / 2), 0]}
            fontSize={fontSize}
            anchorX="center"
            anchorY="middle"
            font="/fonts/Roboto-Bold.woff2"
            fontStyle={fontType === 2 ? "italic" : "normal"}
            fontWeight={700}
            renderOrder={10}
          >
            {char}
            <meshBasicMaterial
              color={grooveColor}
              side={THREE.DoubleSide}
              depthTest={false}
              transparent
              opacity={0.9}
            />
          </Text>
        );
      })}
    </group>
  );
}

// ── Viewport ─────────────────────────────────────────────────────────────────

function AliancaViewportInner({
  params,
  profile,
  onMeshReady,
}: {
  params: RingParams;
  profile: ProfileType;
  // Bug #35: `cameraDistance` removida — era prop morta (a câmera usa posição
  // fixa [0,-35,35] e OrbitControls clampa entre 10..60). Mantinha math inútil.
  onMeshReady?: (mesh: THREE.Mesh | null) => void;
}) {
  const handleMesh = useCallback((m: THREE.Mesh | null) => {
    onMeshReady?.(m);
  }, [onMeshReady]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Restore context if lost
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleLost = (e: Event) => { e.preventDefault(); };
    const handleRestored = () => { /* R3F auto-restores */ };
    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, []);

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border" style={{ borderColor: "#E8DCC8", background: "#f1f5f9" }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: "high-performance", alpha: false, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => { canvasRef.current = gl.domElement; }}
      >
        <PerspectiveCamera makeDefault position={[0, -35, 35]} fov={35} />
        <color attach="background" args={["#f1f5f9"]} />
        <StudioEnv />
        <ambientLight intensity={0.4} />
        <hemisphereLight intensity={0.3} color="#ffffff" groundColor="#cbd5e1" />
        <spotLight position={[30, 40, 20]} angle={0.25} penumbra={1} intensity={2.5} />
        <spotLight position={[-30, 20, 10]} angle={0.3} penumbra={1} intensity={1.5} color="#ffffff" />
        <Ring params={params} profileType={profile} onSetMesh={handleMesh} />
        {/* Pedras 3D desabilitadas — renderização simplificada */}
        {/* Suspense interno: drei <Text> suspende ao carregar fonte. Sem este
            boundary, a suspensao "vaza" pro dynamic() loader do componente,
            fazendo o spinner aparecer cada vez que o usuario digita uma letra
            na gravacao e o anel "some" da tela. */}
        <Suspense fallback={null}>
          {params.textEnabled && params.textContent.trim() && (
            <EngravingText
              text={params.textContent.trim()}
              fontType={params.textFontType}
              diameter={params.diameter}
              width={params.width}
              metalColor={params.metalColor}
            />
          )}
        </Suspense>
        <OrbitControls enableDamping minDistance={10} maxDistance={60} rotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}

// React.memo previne re-mount do Canvas quando referências mudam mas valores são iguais
export default React.memo(AliancaViewportInner);
