"use client";

import { fmt } from "@/components/vendas/PagamentoForm";
import type { CrediTipo, CrediParcela } from "@/lib/credi-preview";

/**
 * Painel "Pagamento a prazo (crediário)" — escolha do plano da forma "A Receber".
 *
 * O QUÊ: deixa o operador escolher Mensal (N parcelas) / Em X dias / Sinal e
 * mostra o preview das parcelas que vão virar contas a receber na aprovação.
 *
 * POR QUE: fonte ÚNICA deste painel. Antes era JSX duplicado no wizard (passo 5 e
 * passo 6); agora wizard E detalhe da venda usam este componente. O preview vem do
 * helper calcularCrediPreview (src/lib/credi-preview.ts), que espelha o gatilho
 * fn_venda_gerar_conta_receber (migrations 317/318).
 *
 * IMPACTO SE ALTERADO: muda a UI de parcelamento em TODAS as telas que vendem a
 * prazo (Nova Venda e Detalhe). O plano escolhido aqui (credi_tipo/credi_param) é
 * o que o backend grava em pagamentos_venda e o gatilho lê pra gerar o Crediário.
 */

const C = {
  esmeralda:   "#184036",
  cremeBorder: "#E8DCC8",
};

interface PainelCrediarioProps {
  tipo: CrediTipo;
  setTipo: (t: CrediTipo) => void;
  parcelas: number;
  setParcelas: (n: number) => void;
  diaVenc: number;
  setDiaVenc: (n: number) => void;
  dias: number;
  setDias: (n: number) => void;
  /** Preview já calculado (via calcularCrediPreview) pela tela que usa o painel. */
  preview: CrediParcela[];
}

export default function PainelCrediario({
  tipo, setTipo, parcelas, setParcelas, diaVenc, setDiaVenc, dias, setDias, preview,
}: PainelCrediarioProps) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: C.cremeBorder }}>
      <p className="text-sm font-medium mb-3" style={{ color: "#374151" }}>Pagamento a prazo (crediário)</p>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => setTipo("meses")} className="flex-1 py-2 rounded-lg border text-sm" style={{ borderColor: tipo === "meses" ? C.esmeralda : C.cremeBorder, color: tipo === "meses" ? C.esmeralda : "#6B7280", fontWeight: tipo === "meses" ? 600 : 400 }}>Mensal</button>
        <button type="button" onClick={() => setTipo("dias")} className="flex-1 py-2 rounded-lg border text-sm" style={{ borderColor: tipo === "dias" ? C.esmeralda : C.cremeBorder, color: tipo === "dias" ? C.esmeralda : "#6B7280", fontWeight: tipo === "dias" ? 600 : 400 }}>Em X dias</button>
      </div>
      {tipo === "meses" ? (
        <div className="flex gap-3 mb-3">
          <label className="flex-1 text-xs" style={{ color: "#6B7280" }}>Parcelas
            <input type="number" min={1} max={24} value={parcelas} onChange={e => setParcelas(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }} />
          </label>
          <label className="flex-1 text-xs" style={{ color: "#6B7280" }}>Vence todo dia
            <input type="number" min={1} max={31} value={diaVenc} onChange={e => setDiaVenc(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))} className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }} />
          </label>
        </div>
      ) : (
        <label className="block text-xs mb-3" style={{ color: "#6B7280" }}>Pagar em (dias)
          <input type="number" min={1} max={180} value={dias} onChange={e => setDias(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }} />
        </label>
      )}
      <div className="space-y-1">
        {preview.map(p => (
          <div key={p.num} className="flex justify-between text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.cremeBorder }}>
            <span style={{ color: "#6B7280" }}>{tipo === "meses" ? `Parcela ${p.num}/${preview.length} · ` : ""}vence {p.data.toLocaleDateString("pt-BR")}</span>
            <span className="font-medium tabular-nums" style={{ color: C.esmeralda }}>{fmt(p.valor)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs mt-2" style={{ color: "#92400E" }}>A peça só sai da loja com tudo pago. Liberar entrega devendo precisa de aprovação do SEO.</p>
    </div>
  );
}
