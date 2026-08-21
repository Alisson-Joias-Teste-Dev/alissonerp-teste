/**
 * Molde 3D da aliança — construção do perfil (curva 2D) e medição do volume
 * real do sólido, sem depender de tela/navegador (usado tanto pelo visor 3D
 * quanto pelo cálculo de peso, no cliente e no servidor).
 *
 * O QUE: hoje só o perfil Anatômica tem aqui uma função dedicada
 * (`buildAnatomicaProfile`) e uma medição de volume real (`anatomicaMeshVolume`).
 * `applyGroove`/`getGrooveBands`/`isInGrooveBand` foram movidos de
 * `AliancaViewport.tsx` (não duplicados) porque agora servem os dois lados:
 * o desenho na tela E o cálculo de peso.
 *
 * O PORQUE: o peso da Anatômica era um tubo reto × 88% chutado (ver
 * PROFILE_CORRECTION_FACTOR em constants.ts), sem relação com a curva real
 * — que já existia, desenhada, só para aparecer na tela. `anatomicaMeshVolume`
 * mede o volume de verdade desse sólido (soma de tetraedros assinados sobre
 * a malha fechada — o mesmo tipo de conta que um programa de CAD faz para
 * peça 3D fechada), então o desenho da tela e o peso calculado passam a vir
 * exatamente da mesma fonte.
 *
 * O IMPACTO SE ALTERADO: mudar `buildAnatomicaProfile` sem atualizar
 * `AliancaViewport.tsx` (ou vice-versa) quebra a promessa de "peça na tela =
 * peça pesada". Trocar a ordem groove→revolve muda o volume calculado.
 * Reduzir os segmentos angulares do Lathe demais (< ~64) começa a
 * subestimar o volume por discretização.
 */
import { Vector2, LatheGeometry, type BufferGeometry } from "three";
import type { RingParams, GrooveType } from "./types";

/** Resolução angular do revolve — mesma usada no visor 3D, de propósito
 *  (um número só, nunca dois valores que possam desalinhar tela e peso). */
export const LATHE_ANGULAR_SEGMENTS = 360;

// ── Groove (friso) — corta o contorno ANTES do revolve ──────────────────────

/** Calcula as bandas Y onde o groove deve ser aplicado */
function getGrooveBands(
  grooveType: GrooveType,
  grooveSide: "UPPER" | "LOWER",
  grooveWidth: number,
  grooveOffset: number,
  wH: number,
): Array<[number, number]> {
  switch (grooveType) {
    case "lateral": {
      if (grooveSide === "LOWER") {
        const y1 = -wH + grooveOffset;
        return [[y1, y1 + grooveWidth]];
      }
      const y2 = wH - grooveOffset;
      return [[y2 - grooveWidth, y2]];
    }
    case "centro": {
      return [[-grooveWidth / 2, grooveWidth / 2]];
    }
    case "duplo": {
      const y1L = -wH + grooveOffset;
      const y2U = wH - grooveOffset;
      return [
        [y1L, y1L + grooveWidth],
        [y2U - grooveWidth, y2U],
      ];
    }
  }
}

/** Verifica se um valor Y está dentro de alguma banda de groove */
function isInGrooveBand(y: number, bands: Array<[number, number]>): boolean {
  return bands.some(([y1, y2]) => y >= y1 - 0.001 && y <= y2 + 0.001);
}

/**
 * Aplica groove(s) SOMENTE ao contorno externo do perfil.
 *
 * Estratégia robusta em 2 fases:
 *   1. Separa o contorno em "externo" (Y crescendo, indo de -wH a +wH)
 *      e "interno" (Y decrescendo, voltando de +wH a -wH).
 *   2. Aplica o groove apenas nos segmentos do contorno externo que
 *      estão acima do threshold de raio.
 *
 * Isso garante que a curva interna (ex: Anatômica, Boleada) NUNCA
 * receba cortes de groove, mesmo que tenha pontos com raio alto.
 */
export function applyGroove(
  pts: Vector2[],
  params: RingParams,
  rIn: number,
  wH: number,
): Vector2[] {
  if (!params.hasGroove || params.grooveDepth <= 0 || params.grooveWidth <= 0) return pts;

  const bands = getGrooveBands(params.grooveType, params.grooveSide, params.grooveWidth, params.grooveOffset, wH);
  const depth = Math.min(params.grooveDepth, params.height * 0.4);

  // ── Fase 1: separar contorno externo (0..splitIdx) do interno ────
  // O contorno externo vai de -wH até +wH (Y crescente).
  // O ponto de split é onde Y atinge o máximo.
  let splitIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y > pts[splitIdx].y) splitIdx = i;
    else if (pts[i].y === pts[splitIdx].y && pts[i].x > pts[splitIdx].x) splitIdx = i;
  }

  const outerPts = pts.slice(0, splitIdx + 1);
  const innerPts = pts.slice(splitIdx + 1);

  // Threshold: 80% do raio máximo externo (exclui transições e bordas)
  const maxOuterX = Math.max(...outerPts.map(p => p.x));
  const threshold = rIn + (maxOuterX - rIn) * 0.7;

  // ── Fase 2: aplicar groove apenas ao contorno externo ────────────
  const result: Vector2[] = [];

  for (let i = 0; i < outerPts.length; i++) {
    const p = outerPts[i];
    const pNext = i < outerPts.length - 1 ? outerPts[i + 1] : null;
    const pIsOuter = p.x > threshold;
    const nIsOuter = pNext ? pNext.x > threshold : false;

    if (pIsOuter && nIsOuter && pNext) {
      const yA = p.y, yB = pNext.y;
      const goingUp = yB >= yA;
      const yMin = Math.min(yA, yB);
      const yMax = Math.max(yA, yB);

      const crossings: Array<{ y: number; entering: boolean }> = [];
      for (const [bandStart, bandEnd] of bands) {
        if (bandStart > yMin + 0.001 && bandStart < yMax - 0.001) {
          crossings.push({ y: bandStart, entering: goingUp });
        }
        if (bandEnd > yMin + 0.001 && bandEnd < yMax - 0.001) {
          crossings.push({ y: bandEnd, entering: !goingUp });
        }
      }
      crossings.sort((a, b) => goingUp ? a.y - b.y : b.y - a.y);

      if (isInGrooveBand(p.y, bands)) {
        result.push(new Vector2(p.x - depth, p.y));
      } else {
        result.push(p.clone());
      }

      for (const cr of crossings) {
        const t = (cr.y - yA) / (yB - yA);
        const xAt = p.x + t * (pNext.x - p.x);
        if (cr.entering) {
          result.push(new Vector2(xAt, cr.y));
          result.push(new Vector2(xAt - depth, cr.y));
        } else {
          result.push(new Vector2(xAt - depth, cr.y));
          result.push(new Vector2(xAt, cr.y));
        }
      }
      continue;
    }

    if (pIsOuter && isInGrooveBand(p.y, bands)) {
      result.push(new Vector2(p.x - depth, p.y));
    } else {
      result.push(p.clone());
    }
  }

  // ── Contorno interno: copiar sem alteração ───────────────────────
  for (const p of innerPts) {
    result.push(p.clone());
  }

  return result;
}

// ── Perfil Anatômica ─────────────────────────────────────────────────────

/**
 * Perfil 2D (curva) da Anatômica, pronto para revolver em `LatheGeometry`.
 * Já sai fechado (primeiro e último ponto coincidem) — por isso nem o visor
 * 3D nem `anatomicaMeshVolume` precisam adicionar um ponto de fechamento.
 *
 * `domePercentage` (Boleamento) trava em 0–100%: fora disso a curva interna
 * ultrapassa a parede externa e o perfil se autointersecta (peça inválida).
 * Antes só afetava o desenho; agora também vira peso, então o valor torto
 * de um config antigo não pode mais gerar um cálculo sem sentido.
 */
export function buildAnatomicaProfile(params: RingParams): Vector2[] {
  const rIn = params.diameter / 2;
  const wH = params.width / 2;
  const h = params.height;
  const rOut = rIn + h;
  const domeFactor = Math.max(0, Math.min(100, params.domePercentage)) / 100;
  const sagitta = h * 0.7 * domeFactor;

  const pts: Vector2[] = [];
  pts.push(new Vector2(rIn + sagitta, -wH));
  pts.push(new Vector2(rOut, -wH));
  pts.push(new Vector2(rOut, wH));
  pts.push(new Vector2(rIn + sagitta, wH));
  const segments = 48;
  for (let i = 1; i <= segments; i++) {
    const ratio = i / segments;
    const y = wH - params.width * ratio;
    const yNorm = y / (params.width / 2);
    const xVal = rIn + sagitta * (1 - Math.sqrt(Math.max(0, 1 - yNorm * yNorm)));
    pts.push(new Vector2(xVal, y));
  }
  return pts;
}

/**
 * Volume real (mm³) do sólido Anatômica — perfil fechado revolvido 360° e
 * medido triângulo por triângulo (soma de tetraedros assinados em relação
 * à origem; válido para qualquer malha fechada e orientada, é o método
 * numérico por trás do cálculo de volume de sólido em programas de CAD).
 * Pedra cravada NÃO entra aqui — a pedra nunca fura o metal neste molde,
 * o desconto dela continua em computeWeight (constants.ts), como hoje.
 */
export function anatomicaMeshVolume(
  params: RingParams,
  angularSegments: number = LATHE_ANGULAR_SEGMENTS,
): number {
  const rIn = params.diameter / 2;
  const wH = params.width / 2;
  const pts = applyGroove(buildAnatomicaProfile(params), params, rIn, wH);
  const geo = new LatheGeometry(pts, angularSegments);
  return closedMeshVolume(geo);
}

function closedMeshVolume(geo: BufferGeometry): number {
  const position = geo.getAttribute("position");
  const index = geo.getIndex();
  if (!index) throw new Error("closedMeshVolume: esperava geometria indexada (LatheGeometry sempre gera)");

  let sixV = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    const x1 = position.getX(ia), y1 = position.getY(ia), z1 = position.getZ(ia);
    const x2 = position.getX(ib), y2 = position.getY(ib), z2 = position.getZ(ib);
    const x3 = position.getX(ic), y3 = position.getY(ic), z3 = position.getZ(ic);
    sixV += x1 * (y2 * z3 - z2 * y3) - y1 * (x2 * z3 - z2 * x3) + z1 * (x2 * y3 - y2 * x3);
  }
  return Math.abs(sixV) / 6;
}
