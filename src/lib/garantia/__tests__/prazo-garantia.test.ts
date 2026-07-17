/**
 * Testes da decisão de garantia (src/lib/garantia/prazo-garantia.ts).
 *
 * avaliarGarantia recebe a conexão `db` como parâmetro (tagged template), então
 * o teste passa um `db` FALSO que devolve a linha desejada — sem mockar módulo,
 * sem banco. A única dependência de tempo real é diasUteisDecorridos(entrega,
 * hoje); os casos usam datas robustas a qualquer "hoje":
 *   - entrega = HOJE  → 0 dias úteis, sempre ≤ 7 (dentro do prazo)
 *   - entrega = 2020  → centenas de dias úteis, sempre > 7 (fora do prazo)
 */
import { describe, it, expect } from "vitest";
import { avaliarGarantia } from "../prazo-garantia";

type Row = {
  situacao: string | null;
  data_entrega_real: string | null;
  data_transicao: string | null;
  data_pdv: string | null;
  qtd_tipos: number;
  qtd_vitalicios: number;
};

/** `db` falso: ignora o SQL e devolve sempre a mesma linha (ou []). */
function fakeDb(rows: Row[]) {
  return () => Promise.resolve(rows);
}

// Timestamp completo de AGORA (com hora). Em produção a data vem do postgres como
// timestamptz (instante exato); aqui um ISO com hora evita o artefato de
// new Date("YYYY-MM-DD") ser interpretado como meia-noite UTC (cairia no dia
// anterior em fusos negativos, como o do Brasil).
const agoraISO = () => new Date().toISOString();

const base: Row = {
  situacao: "entregue",
  data_entrega_real: null,
  data_transicao: null,
  data_pdv: null,
  qtd_tipos: 1,
  qtd_vitalicios: 0,
};

describe("avaliarGarantia", () => {
  it("bloqueia venda que não está 'entregue' — trava seca, sem aprovação", async () => {
    const r = await avaliarGarantia(fakeDb([{ ...base, situacao: "aprovado" }]), 1, [4]);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("venda_nao_entregue");
    expect(r.podeSolicitarAprovacao).toBe(false);
  });

  it("bloqueia 'concluido' também (ao pé da letra, só 'entregue')", async () => {
    const r = await avaliarGarantia(fakeDb([{ ...base, situacao: "concluido" }]), 1, [4]);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("venda_nao_entregue");
  });

  it("libera sem prazo quando TODOS os serviços são vitalícios", async () => {
    const r = await avaliarGarantia(
      fakeDb([{ ...base, data_pdv: "2020-01-01", qtd_tipos: 2, qtd_vitalicios: 2 }]),
      1,
      [3, 3],
    );
    expect(r.permitido).toBe(true);
    expect(r.vitalicia).toBe(true);
  });

  it("misto (um não-vitalício) NÃO é vitalício — vale o prazo (o mais restritivo vence)", async () => {
    // 2 tipos, só 1 vitalício, entrega em 2020 → fora do prazo.
    const r = await avaliarGarantia(
      fakeDb([{ ...base, data_pdv: "2020-01-01", qtd_tipos: 2, qtd_vitalicios: 1 }]),
      1,
      [3, 4],
    );
    expect(r.vitalicia).toBe(false);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("fora_do_prazo");
    expect(r.podeSolicitarAprovacao).toBe(true);
  });

  it("dentro do prazo (entregue hoje) → libera", async () => {
    const r = await avaliarGarantia(fakeDb([{ ...base, data_entrega_real: agoraISO() }]), 1, [4]);
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.fonte).toBe("entrega_real");
    expect(r.diasUteis).toBe(0);
  });

  it("fora do prazo (entregue em 2020) → bloqueia e oferece aprovação", async () => {
    const r = await avaliarGarantia(fakeDb([{ ...base, data_entrega_real: "2020-01-01" }]), 1, [4]);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("fora_do_prazo");
    expect(r.podeSolicitarAprovacao).toBe(true);
    expect(r.diasUteis).toBeGreaterThan(7);
  });

  it("sem NENHUMA data confiável → NÃO bloqueia por prazo (não dá pra provar)", async () => {
    const r = await avaliarGarantia(fakeDb([{ ...base, qtd_vitalicios: 0 }]), 1, [4]);
    expect(r.permitido).toBe(true);
    expect(r.fonte).toBeNull();
    expect(r.diasUteis).toBeNull();
  });

  it("prioridade da data: entrega_real ganha de transicao e de pdv", async () => {
    const r = await avaliarGarantia(
      fakeDb([{ ...base, data_entrega_real: agoraISO(), data_transicao: "2020-01-01", data_pdv: "2019-01-01" }]),
      1,
      [4],
    );
    expect(r.fonte).toBe("entrega_real");
    expect(r.permitido).toBe(true);
  });

  it("lista de tipos vazia NÃO conta como 'tudo vitalício' (0 de 0) — cai no prazo", async () => {
    const r = await avaliarGarantia(
      fakeDb([{ ...base, data_entrega_real: "2020-01-01", qtd_tipos: 0, qtd_vitalicios: 0 }]),
      1,
      [],
    );
    expect(r.vitalicia).toBe(false);
    expect(r.motivo).toBe("fora_do_prazo");
  });

  it("venda inexistente → bloqueia (defensivo, nunca libera por falta de dado)", async () => {
    const r = await avaliarGarantia(fakeDb([]), 999, [4]);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("venda_nao_entregue");
  });
});
