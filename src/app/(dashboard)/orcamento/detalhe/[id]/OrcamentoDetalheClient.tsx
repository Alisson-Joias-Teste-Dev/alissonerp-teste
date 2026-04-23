"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import OrcamentoClient from "../../OrcamentoClient";
import type { CurvaConfig, CurvaCategoriaInput } from "@/lib/curva-precificacao";
import type { ConfigOrcamento } from "@/app/(dashboard)/orcamento/types";

const ROLES_APROVACAO = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica"];

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
  const [savedOk, setSavedOk] = useState(false);

  const canAprovar = ROLES_APROVACAO.includes(role) && (status === "rascunho" || status === "enviado");

  const handleAprovar = async () => {
    setLoading("aprovar");
    setMsg(null);
    try {
      const res = await fetch(`/api/orcamento/${orcamento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "aprovado" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao aprovar");
      setStatus("convertido");
      setMsg({ text: `Aprovado! Venda ${data.numero_venda} criada.`, type: "success" });
      setTimeout(() => router.push(`/vendas/erp/${data.venda_id}`), 1800);
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

  const isRascunho = status === "rascunho";

  const token = orcamento.token_compartilhamento as string | null;
  const handleShare = () => {
    if (!token) return;
    const url = `${window.location.origin}/orcamento/compartilhado/${token}`;
    if (navigator.share) {
      navigator.share({ title: `Orçamento ${orcamento.numero_orcamento}`, url });
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copiado!");
    }
  };

  const statusColors: Record<string, string> = {
    rascunho: "#6B7280",
    enviado: "#2563EB",
    aprovado: "#059669",
    convertido: "#059669",
    rejeitado: "#DC2626",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Barra de ações */}
      {(canAprovar || savedOk || msg) && (
        <div className="flex items-center gap-3 px-4 py-2 border-b flex-wrap" style={{ borderColor: "#E8DCC8", backgroundColor: "#FAFAF7" }}>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: statusColors[status] ?? "#6B7280" }}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>

          {msg && (
            <span className={`text-xs font-medium ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>
              {msg.text}
            </span>
          )}

          <div className="flex-1" />

          {canAprovar && !showRejeitar && !["rejeitado", "convertido"].includes(status) && (
            <>
              <button
                onClick={() => setShowRejeitar(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
              >
                <X size={12} /> Rejeitar
              </button>
              <button
                onClick={handleAprovar}
                disabled={loading === "aprovar"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#184036" }}
              >
                {loading === "aprovar" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Aprovar
              </button>
            </>
          )}

          {showRejeitar && (
            <div className="flex items-center gap-2 w-full mt-1">
              <input
                value={motivoRejeicao}
                onChange={e => setMotivoRejeicao(e.target.value)}
                placeholder="Motivo da rejeição (opcional)"
                className="flex-1 text-xs border rounded-lg px-3 py-1.5 outline-none"
                style={{ borderColor: "#E8DCC8" }}
              />
              <button onClick={() => setShowRejeitar(false)} className="text-xs text-gray-500 px-2">Cancelar</button>
              <button
                onClick={handleRejeitar}
                disabled={loading === "rejeitar"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}
              >
                {loading === "rejeitar" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Confirmar Rejeição
              </button>
            </div>
          )}
        </div>
      )}

      {/* Formulário */}
      <div className="flex-1 overflow-auto">
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
          onShare={token ? handleShare : undefined}
          onSaved={() => { setSavedOk(true); setMsg({ text: "Orçamento salvo com sucesso!", type: "success" }); setTimeout(() => setMsg(null), 4000); }}
        />
      </div>
    </div>
  );
}
