"use client";

import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Text } from "@react-three/drei";
import * as THREE from "three";
import { ProfileType } from "./types";
import type { RingParams } from "./types";

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
    const pts: THREE.Vector2[] = [];

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
      case ProfileType.FrisoUnico: {
        const rOut = rIn + h;
        const rGroove = rOut - params.grooveDepth;
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rOut, -wH));
        if (params.grooveSide === "LOWER") {
          const y1 = -wH + params.grooveOffset;
          const y2 = y1 + params.grooveWidth;
          pts.push(new THREE.Vector2(rOut, y1));
          pts.push(new THREE.Vector2(rGroove, y1));
          pts.push(new THREE.Vector2(rGroove, y2));
          pts.push(new THREE.Vector2(rOut, y2));
        } else {
          const y2 = wH - params.grooveOffset;
          const y1 = y2 - params.grooveWidth;
          pts.push(new THREE.Vector2(rOut, y1));
          pts.push(new THREE.Vector2(rGroove, y1));
          pts.push(new THREE.Vector2(rGroove, y2));
          pts.push(new THREE.Vector2(rOut, y2));
        }
        pts.push(new THREE.Vector2(rOut, wH));
        pts.push(new THREE.Vector2(rIn, wH));
        break;
      }
      case ProfileType.FrisoLateral: {
        const rOut = rIn + h;
        const rGroove = rOut - params.grooveDepth;
        const y1L = -wH + params.grooveOffset;
        const y2L = y1L + params.grooveWidth;
        const y2U = wH - params.grooveOffset;
        const y1U = y2U - params.grooveWidth;
        pts.push(new THREE.Vector2(rIn, -wH));
        pts.push(new THREE.Vector2(rOut, -wH));
        pts.push(new THREE.Vector2(rOut, y1L));
        pts.push(new THREE.Vector2(rGroove, y1L));
        pts.push(new THREE.Vector2(rGroove, y2L));
        pts.push(new THREE.Vector2(rOut, y2L));
        pts.push(new THREE.Vector2(rOut, y1U));
        pts.push(new THREE.Vector2(rGroove, y1U));
        pts.push(new THREE.Vector2(rGroove, y2U));
        pts.push(new THREE.Vector2(rOut, y2U));
        pts.push(new THREE.Vector2(rOut, wH));
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
        const rOut = rIn + h;
        const sagitta = h * 0.7 * (params.domePercentage / 100);
        pts.push(new THREE.Vector2(rIn + sagitta, -wH));
        pts.push(new THREE.Vector2(rOut, -wH));
        pts.push(new THREE.Vector2(rOut, wH));
        pts.push(new THREE.Vector2(rIn + sagitta, wH));
        const segments = 48;
        for (let i = 1; i <= segments; i++) {
          const ratio = i / segments;
          const y = wH - params.width * ratio;
          const yNorm = y / (params.width / 2);
          const xVal = rIn + sagitta * (1 - Math.sqrt(Math.max(0, 1 - yNorm * yNorm)));
          pts.push(new THREE.Vector2(xVal, y));
        }
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

    if (
      profileType !== ProfileType.Anatomica &&
      profileType !== ProfileType.BoleadaDouble
    ) {
      pts.push(new THREE.Vector2(rIn, -wH));
    }

    let geo: THREE.BufferGeometry = new THREE.LatheGeometry(pts, 360);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    return geo;
  }, [params, profileType]);

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

// ── Engraving Text (inside ring) ─────────────────────────────────────────────

function EngravingText({
  text,
  fontType,
  diameter,
  width,
  height,
}: {
  text: string;
  fontType: 1 | 2;
  diameter: number;
  width: number;
  height: number;
}) {
  // Place text on the inner surface of the ring
  const rInner = diameter / 2;
  const rOuter = rInner + height;
  const fontSize = Math.min(width * 0.3, 1.0);
  const charCount = text.length;
  const spacing = fontSize * 0.55;
  const totalWidth = charCount * spacing;
  const r = rInner + 0.02; // on inner surface
  const totalAngle = totalWidth / r;
  const startAngle = Math.PI / 2 - totalAngle / 2; // start from front

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {text.split("").map((char, i) => {
        const a = startAngle + (i + 0.5) * (totalAngle / charCount);
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;
        // Face outward from center (readable from inside the ring)
        return (
          <Text
            key={`${i}-${char}`}
            position={[px, 0, pz]}
            rotation={[0, -(a - Math.PI / 2), 0]}
            fontSize={fontSize}
            anchorX="center"
            anchorY="middle"
            fontStyle={fontType === 2 ? "italic" : "normal"}
            renderOrder={999}
          >
            {char}
            <meshBasicMaterial color="#111111" side={THREE.DoubleSide} depthTest={false} transparent opacity={0.85} />
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
  cameraDistance,
  onMeshReady,
}: {
  params: RingParams;
  profile: ProfileType;
  cameraDistance: number;
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
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: "high-performance", alpha: false }}
        onCreated={({ gl }) => { canvasRef.current = gl.domElement; }}
      >
        <PerspectiveCamera makeDefault position={[0, -cameraDistance, cameraDistance]} fov={35} />
        <color attach="background" args={["#f1f5f9"]} />
        <ambientLight intensity={0.7} />
        <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#cbd5e1" />
        <spotLight position={[30, 40, 20]} angle={0.25} penumbra={1} intensity={3} />
        <spotLight position={[-30, 20, 10]} angle={0.3} penumbra={1} intensity={2} color="#ffffff" />
        <Ring params={params} profileType={profile} onSetMesh={handleMesh} />
        {params.textEnabled && params.textContent.trim() && (
          <EngravingText
            text={params.textContent.trim()}
            fontType={params.textFontType}
            diameter={params.diameter}
            width={params.width}
            height={params.height}
          />
        )}
        <Environment preset="warehouse" resolution={512} />
        <OrbitControls enableDamping minDistance={10} maxDistance={60} rotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}

// React.memo previne re-mount do Canvas quando referências mudam mas valores são iguais
export default React.memo(AliancaViewportInner);
