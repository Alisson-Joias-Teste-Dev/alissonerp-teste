"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2, Clock, Search } from "lucide-react";
import NovaMovimentacaoInternaModal from "@/components/forms/NovaMovimentacaoInternaModal";
import ConcluirMovimentacaoInternaModal from "@/components/forms/ConcluirMovimentacaoInternaModal";
import { MobileCard } from "@/components/ui/MobileCard";
import { getPublicUrl } from "@/lib/storage-url";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

type Filtro = "pendentes" | "concluidos" | "todos";

interface MovimentacaoProduto {
  nome: string;
  sku: string | null;
}

interface MovimentacaoRow {
  id: number;
  etapas: string;
  data_conclusao: string | null;
  created_at: string;
  criado_por_nome: string | null;
  concluido_por_nome: string | null;
  foto_criacao: string | null;
  foto_conclusao: string | null;
  produtos: MovimentacaoProduto[];
}

interface Props {
  rows: MovimentacaoRow[];
}

function resolveStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getPublicUrl("protocolo-fotos", path);
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function EtapaBadge({ etapa }: { etapa: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    concluido: { label: "Concluído", bg: "#ECFDF5", color: "#059669" },
    pendente:  { label: "Pendente",  bg: "#FEF3C7", color: "#92400E" },
  };
  const s = cfg[etapa] ?? { label: etapa, bg: "#F3F4F6", color: "#6B7280" };
  const Icon = etapa === "concluido" ? CheckCircle2 : Clock;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}>
      <Icon size={10} />
      {s.label}
    </span>
  );
}

function produtosLabel(produtos: MovimentacaoProduto[]) {
  if (produtos.length === 0) return "—";
  return produtos.map((p) => (p.sku ? `${p.nome} (${p.sku})` : p.nome)).join(", ");
}

export default function MovimentacaoInternaClient({ rows }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [novaAberta, setNovaAberta] = useState(false);
  const [concluir, setConcluir] = useState<MovimentacaoRow | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [busca, setBusca] = useState("");
  const [fotoModal, setFotoModal] = useState<{ url: string; titulo: string } | null>(null);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const abrirFotoModal = (url: string | null | undefined, titulo: string) => {
    if (url) setFotoModal({ url, titulo });
  };

  const countPendentes = rows.filter((r) => r.etapas !== "concluido").length;
  const countConcluidos = rows.filter((r) => r.etapas === "concluido").length;

  const buscaNorm = busca.trim().toLowerCase();
  const rowsPorEtapa =
    filtro === "pendentes" ? rows.filter((r) => r.etapas !== "concluido") :
    filtro === "concluidos" ? rows.filter((r) => r.etapas === "concluido") :
    rows;
  const rowsFiltrados = buscaNorm.length === 0
    ? rowsPorEtapa
    : rowsPorEtapa.filter((r) =>
        r.produtos.some((p) =>
          p.nome.toLowerCase().includes(buscaNorm) || (p.sku ?? "").toLowerCase().includes(buscaNorm)
        )
      );

  const opFiltro: { value: Filtro; label: string; count: number }[] = [
    { value: "pendentes",  label: "Pendentes",  count: countPendentes },
    { value: "concluidos", label: "Concluídas", count: countConcluidos },
    { value: "todos",      label: "Todas",      count: rows.length },
  ];

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Movimentação Interna
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Retirada e devolução de peças dentro da loja
          </p>
        </div>
        <button
          onClick={() => setNovaAberta(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Plus size={15} />
          Registrar Retirada
        </button>
      </div>

      <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s", pointerEvents: isPending ? "none" : undefined }}>

        {/* Busca por produto/SKU */}
        <div className="relative mb-3 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            placeholder="Buscar por produto ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>

        {/* Pills de filtro */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {opFiltro.map((op) => (
            <button
              key={op.value}
              onClick={() => setFiltro(op.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: filtro === op.value ? C.esmeralda : C.creme,
                color: filtro === op.value ? C.creme : "#6B7280",
              }}
            >
              {op.label}
              <span
                className="text-[10px] font-bold px-1 py-0.5 rounded-full"
                style={{
                  backgroundColor: filtro === op.value ? "rgba(255,255,255,0.2)" : "#18403618",
                  color: filtro === op.value ? C.creme : C.esmeralda,
                }}
              >
                {op.count}
              </span>
            </button>
          ))}
        </div>

        {/* Lista mobile */}
        <div className="block md:hidden space-y-3 mb-3">
          {rowsFiltrados.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma movimentação encontrada</p>
          )}
          {rowsFiltrados.map((r) => (
            <MobileCard
              key={r.id}
              titulo={`#${r.id}`}
              subtitulo={produtosLabel(r.produtos)}
              badges={[
                { label: r.etapas === "concluido" ? "Concluído" : "Pendente", cor: r.etapas === "concluido" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700" },
              ]}
              campos={[
                { label: "Aberto por", valor: r.criado_por_nome ?? "—" },
                { label: "Aberto em", valor: fmt(r.created_at) },
                { label: "Confirmado por", valor: r.concluido_por_nome ?? "—" },
                { label: "Confirmado em", valor: fmt(r.data_conclusao) },
                ...((resolveStorageUrl(r.foto_criacao) || resolveStorageUrl(r.foto_conclusao)) ? [{
                  label: "Fotos",
                  valor: (
                    <div className="flex gap-2">
                      {resolveStorageUrl(r.foto_criacao) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveStorageUrl(r.foto_criacao)!}
                          alt="Abertura"
                          className="w-12 h-12 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); abrirFotoModal(resolveStorageUrl(r.foto_criacao), "Foto de Abertura"); }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      {resolveStorageUrl(r.foto_conclusao) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveStorageUrl(r.foto_conclusao)!}
                          alt="Confirmação"
                          className="w-12 h-12 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); abrirFotoModal(resolveStorageUrl(r.foto_conclusao), "Foto de Confirmação"); }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  ),
                }] : []),
                { label: "Ação", valor: r.etapas === "pendente" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConcluir(r); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ backgroundColor: "#18403612", color: C.esmeralda }}
                  >
                    <CheckCircle2 size={11} /> Confirmar recebimento
                  </button>
                ) : "—" },
              ]}
            />
          ))}
        </div>

        {/* Tabela desktop */}
        <div className="hidden md:block rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
                {["ID", "Produtos", "Aberto por", "Aberto em", "Confirmado por", "Confirmado em", "Fotos", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsFiltrados.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma movimentação encontrada</td></tr>
              )}
              {rowsFiltrados.map((r, i) => (
                <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>#{r.id}</td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>{produtosLabel(r.produtos)}</td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>{r.criado_por_nome || "—"}</td>
                  <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{fmt(r.created_at)}</td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>{r.concluido_por_nome || "—"}</td>
                  <td className="px-4 py-3 font-mono text-[11px]" style={{ color: r.data_conclusao ? "#059669" : "#9CA3AF" }}>
                    {fmt(r.data_conclusao)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {resolveStorageUrl(r.foto_criacao) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveStorageUrl(r.foto_criacao)!}
                          alt="Abertura"
                          title="Foto de Abertura"
                          className="w-10 h-10 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => abrirFotoModal(resolveStorageUrl(r.foto_criacao), "Foto de Abertura")}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      {resolveStorageUrl(r.foto_conclusao) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveStorageUrl(r.foto_conclusao)!}
                          alt="Confirmação"
                          title="Foto de Confirmação"
                          className="w-10 h-10 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => abrirFotoModal(resolveStorageUrl(r.foto_conclusao), "Foto de Confirmação")}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3"><EtapaBadge etapa={r.etapas === "concluido" ? "concluido" : "pendente"} /></td>
                  <td className="px-4 py-3 text-right">
                    {r.etapas === "pendente" && (
                      <button
                        onClick={() => setConcluir(r)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold ml-auto"
                        style={{ backgroundColor: "#18403612", color: C.esmeralda }}
                      >
                        <CheckCircle2 size={12} /> Confirmar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal registrar retirada — busca produtos + foto */}
      {novaAberta && (
        <NovaMovimentacaoInternaModal
          isOpen={true}
          onClose={() => setNovaAberta(false)}
          onSuccess={() => { setNovaAberta(false); refresh(); }}
        />
      )}
      {/* Modal confirmar recebimento */}
      {concluir && (
        <ConcluirMovimentacaoInternaModal
          isOpen={true}
          onClose={() => setConcluir(null)}
          movimentacaoId={concluir.id}
          produtos={concluir.produtos.map((p) => p.nome)}
          onSuccess={() => { setConcluir(null); refresh(); }}
        />
      )}

      {/* Modal foto ampliada */}
      {fotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.82)" }}
          onClick={() => setFotoModal(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm" style={{ color: "#fff" }}>{fotoModal.titulo}</h3>
              <button
                onClick={() => setFotoModal(null)}
                className="text-2xl leading-none ml-2 hover:opacity-70 transition-opacity"
                style={{ color: "rgba(255,255,255,0.8)" }}
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotoModal.url}
              alt={fotoModal.titulo}
              className="w-full h-auto object-contain rounded-lg"
              style={{ maxHeight: "75vh" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
