"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, CheckCircle2, Clock, Package } from "lucide-react";
import NovaProtocoloModal from "@/components/forms/NovaProtocoloModal";
import ConcluirProtocoloModal from "@/components/forms/ConcluirProtocoloModal";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

type Tab = "ida" | "volta" | "entregas";

interface ProtocoloRow {
  id: number;
  etapas: string;
  data_conclusao: string | null;
  created_at: string;
  total_ordens: number;
}

interface AprovacaoRow {
  id: number;
  etapas: string;
  ordem_id: number;
  consultora_id: number | null;
  obs: string | null;
  created_at: string;
  numero_ordem: string | null;
  consultora_nome: string | null;
}

interface EntregaRow {
  id: number;
  etapas: string;
  ordem_id: number;
  created_at: string;
  numero_ordem: string | null;
}

interface OrdemConcluida {
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_negociado: number | null;
  cliente_nome: string | null;
}

interface ProtocoloConcluido {
  protocolo_id: number;
  direcao: "ida" | "volta";
  protocolo_criado: string;
  data_conclusao: string | null;
  criado_por_nome: string | null;
  concluido_por_nome: string | null;
  ordens: OrdemConcluida[];
}

interface Props {
  ida: ProtocoloRow[];
  volta: ProtocoloRow[];
  aprovacoes: AprovacaoRow[];
  entregas: EntregaRow[];
}

const TIPO_LABEL: Record<string, string> = {
  servico: "Serviço",
  fabricacao: "Fabricação",
  reposicao_venda: "Rep. Venda",
  reposicao_loja: "Rep. Loja",
  compra_fornecedor: "Compra",
  garantia: "Garantia",
  servico_interno: "S. Interno",
};

function EtapaBadge({ etapa }: { etapa: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    concluido:    { label: "Concluído",    bg: "#ECFDF5", color: "#059669" },
    em_andamento: { label: "Em Andamento", bg: "#EFF6FF", color: "#2563EB" },
    pendente:     { label: "Pendente",     bg: "#FEF3C7", color: "#92400E" },
    aprovado:     { label: "Aprovado",     bg: "#ECFDF5", color: "#059669" },
    reprovado:    { label: "Reprovado",    bg: "#FEF2F2", color: "#DC2626" },
  };
  const s = cfg[etapa] ?? { label: etapa, bg: "#F3F4F6", color: "#6B7280" };
  const Icon = etapa === "concluido" || etapa === "aprovado" ? CheckCircle2 : Clock;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}>
      <Icon size={10} />
      {s.label}
    </span>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function ProtocoloClient({ ida, volta }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ida");
  const [activeModal, setActiveModal] = useState<"nova-ida" | "nova-volta" | null>(null);
  const [concluirProt, setConcluirProt] = useState<ProtocoloRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [concluidos, setConcluidos] = useState<ProtocoloConcluido[] | null>(null);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  useEffect(() => {
    if (tab !== "entregas") return;
    setConcluidos(null);
    fetch("/api/protocolo/concluidos")
      .then((r) => r.json())
      .then((data) => setConcluidos(Array.isArray(data) ? data : []))
      .catch(() => setConcluidos([]));
  }, [tab]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "ida",      label: "Ida",      count: ida.length },
    { key: "volta",    label: "Volta",    count: volta.length },
    { key: "entregas", label: "Entregas", count: concluidos?.length ?? 0 },
  ];

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Protocolo
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Transporte Loja ↔ Fábrica
          </p>
        </div>
        {(tab === "ida" || tab === "volta") && (
          <button
            onClick={() => setActiveModal(tab === "ida" ? "nova-ida" : "nova-volta")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <Plus size={15} /> Novo Protocolo {tab === "ida" ? "Ida" : "Volta"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 rounded-lg p-0.5 mb-5 w-fit" style={{ backgroundColor: C.creme }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            style={{
              backgroundColor: tab === t.key ? C.esmeralda : "transparent",
              color: tab === t.key ? C.creme : "#6B7280",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: tab === t.key ? "#ffffff30" : "#18403620",
                  color: tab === t.key ? C.creme : C.esmeralda,
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo das tabs — mantém visível durante refresh (isPending) */}
      <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s", pointerEvents: isPending ? "none" : undefined }}>

      {/* Tab: Ida */}
      {tab === "ida" && (
        <ProtocoloTable
          rows={ida}
          direcao="ida"
          onConcluir={(row) => setConcluirProt(row)}
        />
      )}

      {/* Tab: Volta */}
      {tab === "volta" && (
        <ProtocoloTable
          rows={volta}
          direcao="volta"
          onConcluir={(row) => setConcluirProt(row)}
        />
      )}

      {/* Tab: Entregas — protocolos concluídos com ordens */}
      {tab === "entregas" && (
        <div className="space-y-4">
          {concluidos === null && (
            <p className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Carregando...</p>
          )}
          {concluidos !== null && concluidos.length === 0 && (
            <p className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhum protocolo concluído.</p>
          )}
          {concluidos?.map((p) => (
            <div key={p.protocolo_id} className="rounded-xl border bg-white" style={{ borderColor: C.cremeBorder }}>
              {/* Cabeçalho do protocolo */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-sm" style={{ color: C.esmeralda }}>
                    Protocolo #{p.protocolo_id}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.cremeBg, color: "#6B7280" }}>
                    {p.direcao === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"}
                  </span>
                </div>
                <EtapaBadge etapa="concluido" />
              </div>

              {/* Responsáveis + data */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs" style={{ color: "#6B7280", borderBottom: `1px solid ${C.cremeBorder}` }}>
                {p.criado_por_nome && <span>Entregue por: <span style={{ color: "#374151" }}>{p.criado_por_nome}</span></span>}
                {p.concluido_por_nome && <span>Recebido por: <span style={{ color: "#374151" }}>{p.concluido_por_nome}</span></span>}
                <span>Concluído em: <span style={{ color: "#374151" }}>{fmt(p.data_conclusao)}</span></span>
              </div>

              {/* Ordens */}
              {p.ordens.length === 0 ? (
                <div className="px-4 py-3 flex items-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                  <Package size={12} /> Sem ordens vinculadas
                </div>
              ) : (
                <div>
                  {p.ordens.map((o, i) => (
                    <div
                      key={o.ordem_id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                      style={{ borderTop: i > 0 ? `1px solid ${C.cremeBorder}` : undefined }}
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/ordens/${o.ordem_id}`}
                          className="font-mono font-semibold hover:underline"
                          style={{ color: "#184036" }}
                          title="Ver detalhes da ordem"
                        >
                          {o.numero_ordem ?? `#${o.ordem_id}`}
                        </Link>
                        <span className="text-xs" style={{ color: "#6B7280" }}>
                          {o.tipo_ordem ? (TIPO_LABEL[o.tipo_ordem] ?? o.tipo_ordem) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs" style={{ color: "#374151" }}>{o.cliente_nome ?? "—"}</span>
                        <span className="font-mono text-xs" style={{ color: "#9CA3AF" }}>
                          {o.peso_negociado ? `${o.peso_negociado}g` : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </div>{/* fim do wrapper isPending */}

      {/* Modals */}
      <NovaProtocoloModal
        isOpen={activeModal === "nova-ida"}
        onClose={() => setActiveModal(null)}
        direcao="ida"
        onSuccess={() => { setActiveModal(null); refresh(); }}
      />
      <NovaProtocoloModal
        isOpen={activeModal === "nova-volta"}
        onClose={() => setActiveModal(null)}
        direcao="volta"
        onSuccess={() => { setActiveModal(null); refresh(); }}
      />
      {concluirProt && (
        <ConcluirProtocoloModal
          isOpen={true}
          onClose={() => setConcluirProt(null)}
          protocoloId={concluirProt.id}
          direcao={tab === "ida" ? "ida" : "volta"}
          totalOrdens={concluirProt.total_ordens}
          onSuccess={() => { setConcluirProt(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ProtocoloTable({
  rows,
  direcao,
  onConcluir,
}: {
  rows: ProtocoloRow[];
  direcao: "ida" | "volta";
  onConcluir: (row: ProtocoloRow) => void;
}) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
            {["ID", "Status", "Ordens", "Criado em", "Concluído em", ""].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhum protocolo encontrado</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
              <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>#{r.id}</td>
              <td className="px-4 py-3"><EtapaBadge etapa={r.etapas} /></td>
              <td className="px-4 py-3 font-mono text-center" style={{ color: "#374151" }}>{r.total_ordens}</td>
              <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{fmt(r.created_at)}</td>
              <td className="px-4 py-3 font-mono text-[11px]" style={{ color: r.data_conclusao ? "#059669" : "#9CA3AF" }}>
                {fmt(r.data_conclusao)}
              </td>
              <td className="px-4 py-3 text-right">
                {r.etapas === "pendente" && (
                  <button
                    onClick={() => onConcluir(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold ml-auto"
                    style={{ backgroundColor: "#18403612", color: C.esmeralda }}
                  >
                    <CheckCircle2 size={12} /> Concluir
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
