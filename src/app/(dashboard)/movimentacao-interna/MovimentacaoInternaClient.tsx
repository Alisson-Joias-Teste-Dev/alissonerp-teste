"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2, Clock, Search, Truck, HandHeart, Undo2, UserCheck, Ban } from "lucide-react";
import SolicitarPecaModal from "@/components/forms/SolicitarPecaModal";
import AcaoSolicitacaoModal, { type AcaoTipo } from "@/components/forms/AcaoSolicitacaoModal";
import HistoricoSolicitacaoModal from "@/components/forms/HistoricoSolicitacaoModal";
import { MobileCard } from "@/components/ui/MobileCard";
import { getPublicUrl } from "@/lib/storage-url";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

type Filtro = "abertas" | "finalizadas" | "canceladas" | "todas";

interface Produto { nome: string; sku: string | null; }

interface SolicitacaoRow {
  id: number;
  status: string;
  descricao: string | null;
  created_at: string;
  entregue_em: string | null;
  recebido_em: string | null;
  volta_solicitada_em: string | null;
  finalizado_em: string | null;
  motivo_final: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  obs_devolucao: string | null;
  fotos_entrega: string[];
  fotos_recebimento: string[];
  fotos_devolucao: string[];
  solicitante_nome: string | null;
  entregue_por_nome: string | null;
  recebido_por_nome: string | null;
  volta_solicitada_por_nome: string | null;
  finalizado_por_nome: string | null;
  cancelado_por_nome: string | null;
  produtos: Produto[];
}

interface Props { rows: SolicitacaoRow[]; }

function resolveStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getPublicUrl("protocolo-fotos", path);
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function produtosLabel(r: SolicitacaoRow) {
  if (r.produtos.length > 0) {
    return r.produtos.map((p) => (p.sku ? `${p.nome} (${p.sku})` : p.nome)).join(", ");
  }
  return r.descricao?.trim() || "—";
}

// status atual → como mostrar (bg/color pro desktop, cor=classe Tailwind pro MobileCard)
function statusInfo(r: SolicitacaoRow): { label: string; bg: string; color: string; cor: string } {
  if (r.status === "solicitado")       return { label: "Solicitado", bg: "#FEF3C7", color: "#92400E", cor: "bg-yellow-100 text-yellow-700" };
  if (r.status === "entregue")         return { label: "Entregue",   bg: "#EFF6FF", color: "#2563EB", cor: "bg-blue-100 text-blue-700" };
  if (r.status === "recebido")         return { label: "Com a solicitante", bg: "#F3F4F6", color: "#6B7280", cor: "bg-gray-100 text-gray-600" };
  if (r.status === "volta_solicitada") return { label: "Volta solicitada", bg: "#FEF3C7", color: "#92400E", cor: "bg-yellow-100 text-yellow-700" };
  if (r.status === "cancelado")        return { label: "Cancelada", bg: "#FCEBEB", color: "#A32D2D", cor: "bg-red-100 text-red-700" };
  // finalizado
  if (r.motivo_final === "cliente_levou") return { label: "Cliente levou", bg: "#ECFDF5", color: "#059669", cor: "bg-green-100 text-green-700" };
  return { label: "Devolvido", bg: "#F3F4F6", color: "#6B7280", cor: "bg-gray-100 text-gray-600" };
}

// acoes disponiveis no estado atual (recebido tem 2: cliente levou / devolver)
// 'solicitado' tem 2: entregar OU cancelar — cancelar so existe aqui, enquanto a
// peca ainda esta no estoque. Depois de entregue o desfecho e devolucao/cliente.
function acoesDoStatus(status: string): { tipo: AcaoTipo; label: string; icon: typeof Truck; perigo?: boolean }[] {
  if (status === "solicitado")       return [
    { tipo: "entregar", label: "Confirmar entrega", icon: Truck },
    { tipo: "cancelar", label: "Cancelar", icon: Ban, perigo: true },
  ];
  if (status === "entregue")         return [{ tipo: "receber", label: "Confirmar recebimento", icon: HandHeart }];
  if (status === "recebido")         return [
    { tipo: "cliente_levou", label: "Cliente levou", icon: UserCheck },
    { tipo: "solicitar_volta", label: "Devolver ao estoque", icon: Undo2 },
  ];
  if (status === "volta_solicitada") return [{ tipo: "confirmar_devolucao", label: "Confirmar devolução", icon: CheckCircle2 }];
  return [];
}

export default function MovimentacaoInternaClient({ rows }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [solicitarAberto, setSolicitarAberto] = useState(false);
  const [acao, setAcao] = useState<{ row: SolicitacaoRow; tipo: AcaoTipo } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [busca, setBusca] = useState("");
  const [historico, setHistorico] = useState<SolicitacaoRow | null>(null);
  const [fotoModal, setFotoModal] = useState<{ url: string; titulo: string } | null>(null);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  const abrirFoto = (url: string | null | undefined, titulo: string) => { if (url) setFotoModal({ url, titulo }); };

  // "Em aberto" = ainda pendente de acao. Cancelada NAO e aberta — o motivo de
  // existir o cancelamento e justamente tirar do "Em aberto" o que ninguem vai
  // resolver. IMPACTO: se voltar a ser so `!== finalizado`, a cancelada reaparece
  // como pendente e a feature perde o proposito.
  const estaEncerrada = (s: string) => s === "finalizado" || s === "cancelado";
  const countAbertas = rows.filter((r) => !estaEncerrada(r.status)).length;
  const countFinalizadas = rows.filter((r) => r.status === "finalizado").length;
  const countCanceladas = rows.filter((r) => r.status === "cancelado").length;

  const buscaNorm = busca.trim().toLowerCase();
  const porFiltro =
    filtro === "abertas" ? rows.filter((r) => !estaEncerrada(r.status)) :
    filtro === "finalizadas" ? rows.filter((r) => r.status === "finalizado") :
    filtro === "canceladas" ? rows.filter((r) => r.status === "cancelado") :
    rows;
  const rowsFiltrados = buscaNorm.length === 0 ? porFiltro : porFiltro.filter((r) =>
    r.produtos.some((p) => p.nome.toLowerCase().includes(buscaNorm) || (p.sku ?? "").toLowerCase().includes(buscaNorm))
    || (r.descricao ?? "").toLowerCase().includes(buscaNorm)
  );

  const opFiltro: { value: Filtro; label: string; count: number }[] = [
    { value: "abertas",     label: "Em aberto",   count: countAbertas },
    { value: "finalizadas", label: "Finalizadas", count: countFinalizadas },
    { value: "canceladas",  label: "Canceladas",  count: countCanceladas },
    { value: "todas",       label: "Todas",       count: rows.length },
  ];

  function FotosCell({ r, small }: { r: SolicitacaoRow; small?: boolean }) {
    const size = small ? "w-12 h-12" : "w-10 h-10";
    // Cada etapa pode ter VARIAS fotos (mig 349) — achata todas numa lista so.
    const fotos: { path: string; titulo: string }[] = [
      ...r.fotos_entrega.map((p) => ({ path: p, titulo: "Foto da Entrega" })),
      ...r.fotos_recebimento.map((p) => ({ path: p, titulo: "Foto do Recebimento" })),
      ...r.fotos_devolucao.map((p) => ({ path: p, titulo: "Foto da Devolução" })),
    ];
    const visiveis = fotos.filter((f) => resolveStorageUrl(f.path));
    if (visiveis.length === 0) return <span style={{ color: "#9CA3AF" }}>—</span>;
    return (
      <div className="flex gap-1.5 flex-wrap">
        {visiveis.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={resolveStorageUrl(f.path)!} alt={f.titulo} title={f.titulo}
            className={`${size} rounded object-cover cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={(e) => { e.stopPropagation(); abrirFoto(resolveStorageUrl(f.path), f.titulo); }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Movimentação Interna
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Solicitação e devolução de peças dentro da loja</p>
        </div>
        <button onClick={() => setSolicitarAberto(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}>
          <Plus size={15} /> Solicitar Peça
        </button>
      </div>

      <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s", pointerEvents: isPending ? "none" : undefined }}>
        <div className="relative mb-3 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input type="text" placeholder="Buscar por produto, SKU ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none" style={{ borderColor: C.cremeBorder }} />
        </div>

        <div className="flex gap-1.5 mb-4 flex-wrap">
          {opFiltro.map((op) => (
            <button key={op.value} onClick={() => setFiltro(op.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{ backgroundColor: filtro === op.value ? C.esmeralda : C.creme, color: filtro === op.value ? C.creme : "#6B7280" }}>
              {op.label}
              <span className="text-[10px] font-bold px-1 py-0.5 rounded-full"
                style={{ backgroundColor: filtro === op.value ? "rgba(255,255,255,0.2)" : "#18403618", color: filtro === op.value ? C.creme : C.esmeralda }}>
                {op.count}
              </span>
            </button>
          ))}
        </div>

        {/* Lista mobile */}
        <div className="block md:hidden space-y-3 mb-3">
          {rowsFiltrados.length === 0 && <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma solicitação encontrada</p>}
          {rowsFiltrados.map((r) => {
            const si = statusInfo(r);
            const acoes = acoesDoStatus(r.status);
            return (
              <MobileCard key={r.id} titulo={`#${r.id}`} subtitulo={produtosLabel(r)}
                onClick={() => setHistorico(r)}
                badges={[{ label: si.label, cor: si.cor }]}
                campos={[
                  { label: "Solicitado por", valor: r.solicitante_nome ?? "—" },
                  { label: "Solicitado em", valor: fmt(r.created_at) },
                  ...(r.entregue_por_nome ? [{ label: "Entregue por", valor: r.entregue_por_nome }] : []),
                  ...(r.recebido_por_nome ? [{ label: "Recebido por", valor: r.recebido_por_nome }] : []),
                  ...(r.volta_solicitada_por_nome ? [{ label: "Volta pedida por", valor: r.volta_solicitada_por_nome }] : []),
                  ...(r.finalizado_por_nome ? [{ label: "Finalizado por", valor: r.finalizado_por_nome }] : []),
                  ...(r.cancelado_por_nome ? [{ label: "Cancelado por", valor: r.cancelado_por_nome }] : []),
                  ...(r.motivo_cancelamento ? [{ label: "Motivo", valor: r.motivo_cancelamento }] : []),
                  { label: "Fotos", valor: <FotosCell r={r} small /> },
                  { label: "Ação", valor: acoes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {acoes.map((ac) => (
                        <button key={ac.tipo} onClick={(e) => { e.stopPropagation(); setAcao({ row: r, tipo: ac.tipo }); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
                          style={ac.perigo ? { backgroundColor: "#FCEBEB", color: "#A32D2D" } : { backgroundColor: "#18403612", color: C.esmeralda }}>
                          <ac.icon size={11} /> {ac.label}
                        </button>
                      ))}
                    </div>
                  ) : "—" },
                ]} />
            );
          })}
        </div>

        {/* Tabela desktop */}
        <div className="hidden md:block rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
                {["ID", "Produtos / Descrição", "Solicitado por", "Status", "Fotos", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsFiltrados.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma solicitação encontrada</td></tr>}
              {rowsFiltrados.map((r, i) => {
                const si = statusInfo(r);
                const acoes = acoesDoStatus(r.status);
                return (
                  <tr key={r.id} onClick={() => setHistorico(r)} className="cursor-pointer hover:bg-[#FAFAF7] transition-colors"
                    style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }} title="Ver histórico">
                    <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>#{r.id}</td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "#374151", maxWidth: 280 }}>{produtosLabel(r)}</td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>{r.solicitante_nome || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: si.bg, color: si.color }}>
                        {r.status === "cancelado" ? <Ban size={10} /> : r.status === "finalizado" ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                        {si.label}
                      </span>
                    </td>
                    <td className="px-4 py-3"><FotosCell r={r} /></td>
                    <td className="px-4 py-3 text-right">
                      {/* Cancelada nao tem acao — o espaco mostra o motivo, que e a
                          informacao util pro gestor ver por que desistiram. */}
                      {r.status === "cancelado" && (
                        <span className="text-[11px] italic" style={{ color: "#9CA3AF" }} title={r.motivo_cancelamento ?? ""}>
                          {r.motivo_cancelamento || "—"}
                        </span>
                      )}
                      {acoes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {acoes.map((ac) => (
                            <button key={ac.tipo} onClick={(e) => { e.stopPropagation(); setAcao({ row: r, tipo: ac.tipo }); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                              style={ac.perigo ? { backgroundColor: "#FCEBEB", color: "#A32D2D" } : { backgroundColor: "#18403612", color: C.esmeralda }}>
                              <ac.icon size={12} /> {ac.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {solicitarAberto && (
        <SolicitarPecaModal isOpen={true} onClose={() => setSolicitarAberto(false)} onSuccess={() => { setSolicitarAberto(false); refresh(); }} />
      )}
      {acao && (
        <AcaoSolicitacaoModal isOpen={true} onClose={() => setAcao(null)} solicitacaoId={acao.row.id} tipo={acao.tipo}
          produtosLabel={produtosLabel(acao.row)} onSuccess={() => { setAcao(null); refresh(); }} />
      )}
      {historico && (
        <HistoricoSolicitacaoModal isOpen={true} onClose={() => setHistorico(null)} row={historico}
          produtosLabel={produtosLabel(historico)} onAbrirFoto={abrirFoto} />
      )}

      {fotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.82)" }} onClick={() => setFotoModal(null)}>
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm" style={{ color: "#fff" }}>{fotoModal.titulo}</h3>
              <button onClick={() => setFotoModal(null)} className="text-2xl leading-none ml-2 hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.8)" }}>✕</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoModal.url} alt={fotoModal.titulo} className="w-full h-auto object-contain rounded-lg" style={{ maxHeight: "75vh" }} />
          </div>
        </div>
      )}
    </div>
  );
}
