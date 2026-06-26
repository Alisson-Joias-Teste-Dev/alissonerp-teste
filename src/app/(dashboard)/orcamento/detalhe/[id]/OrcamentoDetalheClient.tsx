"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import OrcamentoClient from "../../OrcamentoClient";
import type { CurvaConfig, CurvaCategoriaInput } from "@/lib/curva-precificacao";
import type { ConfigOrcamento } from "@/app/(dashboard)/orcamento/types";
import { ROLES_APROVACAO } from "@/lib/orcamento-shared";

interface Props {
  orcamento: Record<string, any>;
  role: string;
  cotacaoOuro: number;
  cotacaoDolar: number;
  config: ConfigOrcamento | null;
  canManageConfig: boolean;
  userName: string;
  userId: string;
  vendedorId: number | null;
  maxDesconto: number;
  curvaConfig: CurvaConfig | null;
  curvaCategorias: CurvaCategoriaInput[];
}

const STATUS_COLORS: Record<string, string> = {
  rascunho: "#6B7280",
  enviado: "#2563EB",
  aprovado: "#059669",
  convertido: "#059669",
  rejeitado: "#DC2626",
  cancelado: "#4B5563",
};

export default function OrcamentoDetalheClient({
  orcamento,
  role,
  cotacaoOuro,
  cotacaoDolar,
  config,
  canManageConfig,
  userName,
  userId,
  vendedorId,
  maxDesconto,
  curvaConfig,
  curvaCategorias,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(String(orcamento.status ?? "rascunho"));
  const [loading, setLoading] = useState<"aprovar" | "rejeitar" | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  // Bug fix v2.58.2: rastreia o cliente atual do OrcamentoClient para enviar
  // no body do PATCH de aprovacao. Sem isso, se o usuario selecionou um cliente
  // mas nao salvou, o backend lia null do banco e devolvia 422.
  const [clienteState, setClienteState] = useState<{ clienteId: number | null; dirty: boolean }>({
    clienteId: (orcamento.cliente_id as number | null) ?? null,
    dirty: false,
  });

  const canAprovar = (ROLES_APROVACAO as readonly string[]).includes(role) && ["rascunho", "enviado"].includes(status);

  const handleAprovar = async () => {
    setLoading("aprovar");
    setMsg(null);
    try {
      const res = await fetch(`/api/orcamento/${orcamento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "aprovado",
          // Bug fix v2.58.2: envia cliente_id atual do state — funciona mesmo
          // se o usuario nao clicou em Salvar antes de Aprovar.
          ...(clienteState.clienteId != null ? { cliente_id: clienteState.clienteId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao aprovar");
      setStatus("convertido");
      setMsg({ text: `Aprovado! Venda ${data.numero_venda} criada.`, type: "success" });
      setTimeout(() => router.push(`/vendas/${data.venda_id}`), 1800);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro", type: "error" });
    } finally {
      setLoading(null);
    }
  };

  const handleRejeitar = async () => {
    setLoading("rejeitar");
    setMsg(null);
    try {
      const res = await fetch(`/api/orcamento/${orcamento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejeitado", motivo_rejeicao: motivoRejeicao }),
      });
      if (!res.ok) throw new Error("Erro ao rejeitar");
      setStatus("rejeitado");
      setShowRejeitar(false);
      setMsg({ text: "Orçamento rejeitado.", type: "success" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro", type: "error" });
    } finally {
      setLoading(null);
    }
  };

  // Compartilhar: feature ainda não implementada. Antes mostrava o botão e
  // abria `alert("em construção")` — frustrava o usuário. Escondido até que
  // o fluxo real (gerar link público + abrir /vendas/compartilhada/{token})
  // esteja pronto. `onShare` undefined faz o componente filho não renderizar
  // o botão.
  const handleShare: (() => void) | undefined = undefined;

  const extraActions = (
    <>
      {/* Badge status */}
      <span
        className="text-[10px] font-semibold px-2 py-1 rounded-full text-white"
        style={{ backgroundColor: STATUS_COLORS[status] ?? "#6B7280" }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>

      {/* Mensagem feedback */}
      {msg && (
        <span className={`text-[10px] font-medium ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>
          {msg.text}
        </span>
      )}

      {/* Rejeitar inline */}
      {showRejeitar ? (
        <>
          <input
            value={motivoRejeicao}
            onChange={e => setMotivoRejeicao(e.target.value)}
            placeholder="Motivo (opcional)"
            className="text-[10px] border rounded-lg px-2 py-1 outline-none w-36"
            style={{ borderColor: "#E8DCC8" }}
          />
          <button
            onClick={() => setShowRejeitar(false)}
            className="text-[10px] text-gray-400 px-1"
          >
            Cancelar
          </button>
          <button
            onClick={handleRejeitar}
            disabled={loading === "rejeitar"}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#DC2626" }}
          >
            {loading === "rejeitar" ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
            Confirmar
          </button>
        </>
      ) : canAprovar && !["rejeitado", "convertido"].includes(status) ? (
        <>
          <button
            onClick={() => setShowRejeitar(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold border"
            style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
          >
            <X size={10} /> Rejeitar
          </button>
          <button
            onClick={handleAprovar}
            disabled={loading === "aprovar"}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#184036" }}
          >
            {loading === "aprovar" ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            Aprovar
          </button>
        </>
      ) : null}
    </>
  );

  const isRascunho = status === "rascunho";

  return (
    <OrcamentoClient
      cotacaoOuro={cotacaoOuro}
      cotacaoDolar={cotacaoDolar}
      config={config}
      canManageConfig={canManageConfig}
      userName={userName}
      userId={userId}
      vendedorId={vendedorId}
      maxDesconto={maxDesconto}
      curvaConfig={curvaConfig}
      curvaCategorias={curvaCategorias}
      initialOrcamento={orcamento}
      readOnly={!isRascunho}
      onShare={handleShare}
      onSaved={() => {
        setMsg({ text: "Orçamento salvo com sucesso!", type: "success" });
        setTimeout(() => setMsg(null), 4000);
      }}
      onStateChange={setClienteState}
      extraActions={extraActions}
    />
  );
}
