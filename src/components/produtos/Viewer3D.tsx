'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type * as T from 'three';

interface Medidas {
  largura?: number | string | null;
  altura?: number | string | null;
  profundidade?: number | string | null;
  diametro_interno?: number | string | null;
  peso_g?: number | string | null;
  qtd_pedras?: number | null;
  tamanho_pedras_mm?: number | string | null;
  tipo_peca?: string | null;
}

interface Viewer3DProps {
  /** ID do produto — busca o modelo via API (ProdutoDrawer). */
  produtoId?: number;
  /** JSON three.js pré-carregado — evita roundtrip à API (stepper). */
  jsonData?: object | null;
  medidas?: Medidas;
  alturaCanvas?: number;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

export default function Viewer3D({ produtoId, jsonData, medidas, alturaCanvas = 360 }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'idle' | 'buscando' | 'convertendo' | 'carregando' | 'ok' | 'erro'>('idle');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const iniciar = useCallback(async () => {
    if (!containerRef.current) return;

    setEstado('buscando');
    setErroMsg(null);

    // ── 1. Obter dados JSON do modelo three.js ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let threejsData: any;

    if (jsonData) {
      threejsData = jsonData;
    } else if (produtoId) {
      try {
        const res = await fetch(`/api/produtos/${produtoId}/modelo-3d/json`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const { url } = await res.json() as { url: string };
        setEstado('convertendo');
        const jsonRes = await fetch(url);
        if (!jsonRes.ok) throw new Error(`Fetch do modelo falhou: HTTP ${jsonRes.status}`);
        threejsData = await jsonRes.json();
      } catch (err) {
        setErroMsg(err instanceof Error ? err.message : 'Erro ao obter modelo');
        setEstado('erro');
        return;
      }
    } else {
      setErroMsg('Sem fonte de dados 3D');
      setEstado('erro');
      return;
    }

    // ── 2. Importar three.js ──────────────────────────────────────────────────────
    let THREE: typeof import('three');
    try {
      THREE = await import('three');
    } catch {
      setErroMsg('Nao foi possivel carregar three.js');
      setEstado('erro');
      return;
    }

    setEstado('carregando');

    const container = containerRef.current;
    if (!container) return;

    const largura = toNum(medidas?.largura);
    const altura = toNum(medidas?.altura);
    const profundidade = toNum(medidas?.profundidade);

    // ── 3. Configurar cena ──────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const w = container.clientWidth || 400;
    const h = alturaCanvas;

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 2000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Iluminacao showroom joalheria
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const spot1 = new THREE.DirectionalLight(0xfff8e8, 1.0);
    spot1.position.set(50, 60, 50);
    scene.add(spot1);
    const spot2 = new THREE.DirectionalLight(0xe8f0ff, 0.6);
    spot2.position.set(-40, 30, -40);
    scene.add(spot2);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(0, -20, 30);
    scene.add(fillLight);
    // Rim light para brilho nas bordas
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(-30, 40, -60);
    scene.add(rimLight);

    // Material ouro 18k amarelo
    const materialOuro = new THREE.MeshStandardMaterial({
      color: 0xd4a843,
      metalness: 0.95,
      roughness: 0.08,
      envMapIntensity: 1.2,
    });

    // ── 4. Parsear o JSON three.js ─────────────────────────────────────────────
    let modeloObj: T.Object3D | null = null;
    try {
      const geoLoader = new THREE.BufferGeometryLoader();

      if (Array.isArray(threejsData)) {
        const group = new THREE.Group();
        for (const geoJson of threejsData) {
          const geometry = geoLoader.parse(geoJson);
          group.add(new THREE.Mesh(geometry, materialOuro));
        }
        modeloObj = group;

      } else if (threejsData?.metadata?.type === 'BufferGeometry' || threejsData?.data?.attributes || threejsData?.attributes) {
        const geometry = geoLoader.parse(threejsData);
        modeloObj = new THREE.Mesh(geometry, materialOuro);

      } else {
        const loader = new THREE.ObjectLoader();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modeloObj = loader.parse(threejsData as any);
        modeloObj.traverse((child: T.Object3D) => {
          if ((child as T.Mesh).isMesh) {
            (child as T.Mesh).material = materialOuro;
          }
        });
      }

      if (!modeloObj) throw new Error('Nenhum objeto 3D gerado');

      if (!(modeloObj as T.Mesh).isMesh) {
        modeloObj.traverse((child: T.Object3D) => {
          if ((child as T.Mesh).isMesh) {
            (child as T.Mesh).material = materialOuro;
          }
        });
      }

      // Centralizar na origem
      const boxOrig = new THREE.Box3().setFromObject(modeloObj);
      const center = boxOrig.getCenter(new THREE.Vector3());
      modeloObj.position.sub(center);
      scene.add(modeloObj);

      const boxFinal = new THREE.Box3().setFromObject(modeloObj);
      const size = boxFinal.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);

      // Camera
      const dist = maxDim * 2.2;
      camera.position.set(dist * 0.8, dist * 0.6, dist);
      camera.lookAt(0, 0, 0);

      // ── 5. Linhas de cota ──────────────────────────────────────────────────────
      if (largura || altura || profundidade) {
        adicionarCotas(scene, boxFinal, {
          largura:      largura      ?? 0,
          altura:       altura       ?? 0,
          profundidade: profundidade ?? 0,
        }, THREE);
      }

      setEstado('ok');

    } catch (err) {
      console.error('[Viewer3D] Erro ao carregar modelo:', err);
      setErroMsg(err instanceof Error ? err.message : 'Erro ao carregar modelo 3D');
      setEstado('erro');
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      return;
    }

    // ── 6. Controles de camera (orbit manual) ─────────────────────────────────
    let isDragging = false;
    let isPanning = false;
    let prevMouse = { x: 0, y: 0 };
    const spherical = { theta: Math.atan2(camera.position.x, camera.position.z), phi: Math.acos(camera.position.y / camera.position.length()) };
    let radius = camera.position.length();
    const panTarget = new THREE.Vector3(0, 0, 0);

    function updateCamera() {
      camera.position.x = panTarget.x + radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = panTarget.y + radius * Math.cos(spherical.phi);
      camera.position.z = panTarget.z + radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(panTarget);
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2 || e.shiftKey) { isPanning = true; isDragging = false; }
      else { isDragging = true; isPanning = false; }
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };

      if (isDragging) {
        spherical.theta -= dx * 0.008;
        spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi - dy * 0.008));
        updateCamera();
      } else if (isPanning) {
        const panSpeed = radius * 0.001;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        up.copy(camera.up);
        panTarget.addScaledVector(right, -dx * panSpeed);
        panTarget.addScaledVector(up, dy * panSpeed);
        updateCamera();
      }
    };
    const onMouseUp = () => { isDragging = false; isPanning = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius *= e.deltaY > 0 ? 1.12 : 0.88;
      radius = Math.max(0.1, Math.min(radius, 1000));
      updateCamera();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // Touch
    let lastTouchDist = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDragging = false;
        const t0 = e.touches[0], t1 = e.touches[1];
        lastTouchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        lastTouchCenter = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - prevMouse.x;
        const dy = e.touches[0].clientY - prevMouse.y;
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        spherical.theta -= dx * 0.008;
        spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi - dy * 0.008));
        updateCamera();
      } else if (e.touches.length === 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        if (lastTouchDist > 0) {
          radius *= lastTouchDist / dist;
          radius = Math.max(0.1, Math.min(radius, 1000));
        }
        lastTouchDist = dist;
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const panDx = cx - lastTouchCenter.x;
        const panDy = cy - lastTouchCenter.y;
        lastTouchCenter = { x: cx, y: cy };
        const panSpeed = radius * 0.001;
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        panTarget.addScaledVector(right, -panDx * panSpeed);
        panTarget.addScaledVector(camera.up, panDy * panSpeed);
        updateCamera();
      }
    };
    const onTouchEnd = () => { isDragging = false; lastTouchDist = 0; };

    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    // ── 7. Render loop ─────────────────────────────────────────────────────────
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // ── 8. Resize ──────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const newW = container.clientWidth;
      camera.aspect = newW / h;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, h);
    });
    ro.observe(container);

    // ── Cleanup ────────────────────────────────────────────────────────────────
    cleanupRef.current = () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      renderer.dispose();
      materialOuro.dispose();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [produtoId, jsonData, medidas, alturaCanvas]);

  useEffect(() => {
    iniciar();
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [iniciar]);

  const largura = toNum(medidas?.largura);
  const altura = toNum(medidas?.altura);
  const profundidade = toNum(medidas?.profundidade);
  const diamInterno = toNum(medidas?.diametro_interno);
  const peso = toNum(medidas?.peso_g);
  const qtdPedras = medidas?.qtd_pedras ?? null;
  const tamPedras = toNum(medidas?.tamanho_pedras_mm);
  const tipoPeca = medidas?.tipo_peca ?? null;

  const temMedidas = largura || altura || profundidade || diamInterno || peso || qtdPedras;

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-gray-200" style={{ height: alturaCanvas, background: '#f0f0f0' }}>
      {/* Canvas container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Estados de loading */}
      {(estado === 'buscando' || estado === 'convertendo' || estado === 'carregando') && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(240,240,240,0.9)' }}>
          <div className="text-center">
            <div className="animate-spin h-7 w-7 border-2 border-[#184036] border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-xs text-gray-500">
              {estado === 'buscando' && 'Verificando modelo...'}
              {estado === 'convertendo' && 'Convertendo .3dm para 3D...'}
              {estado === 'carregando' && 'Carregando modelo...'}
            </p>
          </div>
        </div>
      )}

      {/* Erro */}
      {estado === 'erro' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(240,240,240,0.9)' }}>
          <div className="text-center px-4">
            <p className="text-xs text-red-500 mb-2">{erroMsg ?? 'Nao foi possivel carregar o modelo 3D'}</p>
            <button
              onClick={iniciar}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Painel de medidas (estilo Rhino) */}
      {estado === 'ok' && temMedidas && (
        <>
          {/* Medidas principais - canto superior esquerdo */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {altura != null && (
              <div className="flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 14 14" className="text-gray-500">
                  <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="4" y1="2" x2="10" y2="2" stroke="currentColor" strokeWidth="1" />
                  <line x1="4" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span className="text-[11px] font-bold text-gray-800 bg-white/85 rounded px-1.5 py-0.5 border border-gray-200/80 shadow-sm">
                  {altura.toFixed(2)}mm
                </span>
              </div>
            )}
            {largura != null && (
              <div className="flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 14 14" className="text-gray-500">
                  <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="2" y1="4" x2="2" y2="10" stroke="currentColor" strokeWidth="1" />
                  <line x1="12" y1="4" x2="12" y2="10" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span className="text-[11px] font-bold text-gray-800 bg-white/85 rounded px-1.5 py-0.5 border border-gray-200/80 shadow-sm">
                  {largura.toFixed(2)}mm
                </span>
              </div>
            )}
            {diamInterno != null && (
              <div className="flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 14 14" className="text-gray-500">
                  <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
                  <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className="text-[11px] font-bold text-gray-800 bg-white/85 rounded px-1.5 py-0.5 border border-gray-200/80 shadow-sm">
                  {diamInterno.toFixed(2)}mm
                </span>
              </div>
            )}
          </div>

          {/* Info da peca - canto superior direito */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            {peso != null && (
              <span className="text-[12px] font-bold text-gray-800 bg-white/85 rounded px-2 py-0.5 border border-gray-200/80 shadow-sm">
                {peso.toFixed(1)}g
              </span>
            )}
            {qtdPedras != null && qtdPedras > 0 && (
              <span className="text-[11px] font-semibold text-gray-700 bg-white/85 rounded px-1.5 py-0.5 border border-gray-200/80 shadow-sm">
                {qtdPedras} pedras{tamPedras ? ` de ${tamPedras.toFixed(1)}mm` : ''}
              </span>
            )}
            {tipoPeca && (
              <span className="text-[10px] font-medium text-gray-500 bg-white/80 rounded px-1.5 py-0.5 border border-gray-200/60">
                {tipoPeca}
              </span>
            )}
          </div>
        </>
      )}

      {/* Hint controles */}
      {estado === 'ok' && (
        <div className="absolute bottom-1.5 right-2 text-[9px] text-gray-400 bg-white/60 rounded px-1.5 py-0.5 pointer-events-none">
          Arrastar: rotacionar | Scroll: zoom | Shift+Arrastar: pan
        </div>
      )}
    </div>
  );
}

// ── Linhas de cota 3D ──────────────────────────────────────────────────────────

function adicionarSeta(
  scene: import('three').Scene,
  dir: import('three').Vector3,
  origin: import('three').Vector3,
  length: number,
  color: number,
  headLen: number,
  headW: number,
  THREE: typeof import('three')
) {
  const arrow = new THREE.ArrowHelper(dir, origin, length, color, headLen, headW);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = arrow as any;
  if (a.line?.material) { a.line.material.depthTest = false; a.line.material.depthWrite = false; }
  if (a.cone?.material) { a.cone.material.depthTest = false; a.cone.material.depthWrite = false; }
  scene.add(arrow);
}

function adicionarCotas(
  scene: import('three').Scene,
  bbox: import('three').Box3,
  medidas: { largura: number; altura: number; profundidade: number },
  THREE: typeof import('three')
) {
  const min = bbox.min.clone();
  const max = bbox.max.clone();
  const size = bbox.getSize(new THREE.Vector3());

  const maxSz = Math.max(size.x, size.y, size.z, 1);
  const off = maxSz * 0.14;
  const arrowLen = maxSz * 0.10;
  const headLen  = maxSz * 0.06;
  const headW    = maxSz * 0.04;
  const lW = maxSz * 0.28;
  const lH = lW * 0.5;

  const mat     = new THREE.LineBasicMaterial({ color: 0x333333, depthTest: false, depthWrite: false });
  const corSeta = 0x111111;

  // ── Largura (eixo X) ──────────────────────────────────────────────────────
  if (medidas.largura) {
    const y = min.y - off;
    const z = max.z + off * 0.6;

    const linha = [new THREE.Vector3(min.x, y, z), new THREE.Vector3(max.x, y, z)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linha), mat));

    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(min.x, min.y, z), new THREE.Vector3(min.x, y - off * 0.15, z),
    ]), mat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(max.x, min.y, z), new THREE.Vector3(max.x, y - off * 0.15, z),
    ]), mat));

    adicionarSeta(scene, new THREE.Vector3(1, 0, 0),  linha[0], arrowLen, corSeta, headLen, headW, THREE);
    adicionarSeta(scene, new THREE.Vector3(-1, 0, 0), linha[1], arrowLen, corSeta, headLen, headW, THREE);

    const label = criarLabel(`${medidas.largura.toFixed(2)}`, THREE);
    label.position.set((min.x + max.x) / 2, y - off * 0.45, z);
    label.scale.set(lW, lH, 1);
    scene.add(label);
  }

  // ── Altura (eixo Y) ────────────────────────────────────────────────────────
  if (medidas.altura) {
    const x = max.x + off;
    const z = max.z;

    const linha = [new THREE.Vector3(x, min.y, z), new THREE.Vector3(x, max.y, z)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linha), mat));

    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(max.x, min.y, z), new THREE.Vector3(x + off * 0.15, min.y, z),
    ]), mat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(max.x, max.y, z), new THREE.Vector3(x + off * 0.15, max.y, z),
    ]), mat));

    adicionarSeta(scene, new THREE.Vector3(0, 1, 0),  linha[0], arrowLen, corSeta, headLen, headW, THREE);
    adicionarSeta(scene, new THREE.Vector3(0, -1, 0), linha[1], arrowLen, corSeta, headLen, headW, THREE);

    const label = criarLabel(`${medidas.altura.toFixed(2)}`, THREE);
    label.position.set(x + off * 0.5 + lW * 0.5, (min.y + max.y) / 2, z);
    label.scale.set(lW, lH, 1);
    scene.add(label);
  }

  // ── Profundidade (eixo Z) ──────────────────────────────────────────────────
  if (medidas.profundidade) {
    const x = max.x + off;
    const y = min.y - off;

    const linha = [new THREE.Vector3(x, y, min.z), new THREE.Vector3(x, y, max.z)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linha), mat));

    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(max.x, y, min.z), new THREE.Vector3(x + off * 0.15, y, min.z),
    ]), mat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(max.x, y, max.z), new THREE.Vector3(x + off * 0.15, y, max.z),
    ]), mat));

    adicionarSeta(scene, new THREE.Vector3(0, 0, 1),  linha[0], arrowLen, corSeta, headLen, headW, THREE);
    adicionarSeta(scene, new THREE.Vector3(0, 0, -1), linha[1], arrowLen, corSeta, headLen, headW, THREE);

    const label = criarLabel(`${medidas.profundidade.toFixed(2)}`, THREE);
    label.position.set(x + off * 0.5 + lW * 0.5, y, (min.z + max.z) / 2);
    label.scale.set(lW, lH, 1);
    scene.add(label);
  }
}

function criarLabel(texto: string, THREE: typeof import('three')): import('three').Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(6, 6, 244, 116, 12);
  ctx.fill();

  ctx.strokeStyle = 'rgba(60,60,60,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(6, 6, 244, 116, 12);
  ctx.stroke();

  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${texto}mm`, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Sprite(mat);
}
