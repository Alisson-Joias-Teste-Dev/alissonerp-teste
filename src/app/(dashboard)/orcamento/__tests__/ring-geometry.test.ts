/**
 * Peso real da Anatômica (volume do molde 3D) — trava contra dois riscos:
 * 1. Os outros 6 formatos continuarem EXATAMENTE como estavam (nenhum deles
 *    deveria mudar com esta correção — decisão do Alisson, 21/08/2026: só
 *    Anatômica por enquanto).
 * 2. A Anatômica realmente medir o volume do sólido revolvido, não voltar a
 *    ser um chute — e ficar mais perto da peça real pesada na balança (aro
 *    28, 8,20mm larg., 1,64mm esp. → 12,5g reais; a fórmula antiga
 *    calculava 13,5g).
 */
import { describe, it, expect } from "vitest";
import { computeWeight, DEFAULT_PARAMS, RING_SIZES, densidadePorTeor } from "../constants";
import { ProfileType } from "../types";
import { buildAnatomicaProfile, anatomicaMeshVolume } from "../ring-geometry";

const BASE = { ...DEFAULT_PARAMS, diameter: 17.51, width: 6.0, height: 1.5, goldDensity: 14.69 };

const toXY = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x, y: p.y }));

describe("computeWeight — outros 6 formatos não mudam", () => {
  // weightRaw conferido manualmente em 21/08/2026, ANTES desta correção —
  // com os mesmos parâmetros (BASE), pela fórmula tubo × PROFILE_CORRECTION_FACTOR.
  const casos: Array<[ProfileType, number]> = [
    [ProfileType.Concava, 6.475],
    [ProfileType.QuadradoCanal, 6.116],
    [ProfileType.Boleada, 6.711],
    [ProfileType.BoleadaDouble, 6.159],
    [ProfileType.Simples, 7.896],
    [ProfileType.Chanfrada, 6.948],
  ];

  for (const [profile, weightRawEsperado] of casos) {
    it(`${profile}: peso continua igual ao de antes da correção`, () => {
      const r = computeWeight(BASE, profile);
      expect(r.weightRaw).toBeCloseTo(weightRawEsperado, 2);
    });
  }
});

describe("buildAnatomicaProfile — perfil fechado", () => {
  it("primeiro e último ponto coincidem (não precisa de fechamento manual)", () => {
    const pts = buildAnatomicaProfile(BASE);
    const first = pts[0];
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(first.x, 6);
    expect(last.y).toBeCloseTo(first.y, 6);
  });

  it("Boleamento fora de 0-100% trava nos limites (não gera peça furada)", () => {
    const semBoleamento = buildAnatomicaProfile({ ...BASE, domePercentage: 0 });
    const negativo = buildAnatomicaProfile({ ...BASE, domePercentage: -50 });
    const cheio = buildAnatomicaProfile({ ...BASE, domePercentage: 100 });
    const acimaDoLimite = buildAnatomicaProfile({ ...BASE, domePercentage: 300 });

    expect(toXY(negativo)).toEqual(toXY(semBoleamento));
    expect(toXY(acimaDoLimite)).toEqual(toXY(cheio));
  });
});

describe("anatomicaMeshVolume — mede o sólido real, não chuta uma %", () => {
  it("sem boleamento (0%), o sólido é o tubo reto — bate com a fórmula antiga", () => {
    const params = { ...BASE, domePercentage: 0 };
    const rIn = params.diameter / 2;
    const rOut = rIn + params.height;
    const baseVolumeTuboReto = Math.PI * (rOut ** 2 - rIn ** 2) * params.width;
    const volumeReal = anatomicaMeshVolume(params);
    // Tolerância pela discretização do revolve em 360 fatias, não é 0 exato.
    expect(Math.abs(volumeReal - baseVolumeTuboReto)).toBeLessThan(1);
  });

  it("mais boleamento tira mais metal (nunca o contrário)", () => {
    const v0 = anatomicaMeshVolume({ ...BASE, domePercentage: 0 });
    const v50 = anatomicaMeshVolume({ ...BASE, domePercentage: 50 });
    const v100 = anatomicaMeshVolume({ ...BASE, domePercentage: 100 });
    expect(v50).toBeLessThan(v0);
    expect(v100).toBeLessThan(v50);
  });
});

describe("caso real — aro 28, ouro amarelo 18k (21/08/2026)", () => {
  it("fica mais perto do peso real (12,5g) do que a fórmula antiga (13,5g)", () => {
    const diametroAro28 = RING_SIZES.find((r) => r.size === 28)!.diameter;
    const params = {
      ...BASE,
      diameter: diametroAro28,
      width: 8.2,
      height: 1.64,
      goldDensity: densidadePorTeor(75, "amarelo"),
      domePercentage: 100,
    };
    const { weight } = computeWeight(params, ProfileType.Anatomica);
    const pesoReal = 12.5;
    const gapFormulaAntiga = 1.0; // 13,5 − 12,5, a diferença que existia antes desta correção
    expect(Math.abs(weight - pesoReal)).toBeLessThan(gapFormulaAntiga);
  });
});
