"use client";

import { useState, useEffect } from "react";
import { X, User, Scale, Flame, Gem, Clock, Image as ImageIcon } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ServicoRow {
  id: number;
  ordem_id: number;
  operador_id: number | null;
  tentativa: number;
  peso_entrada: number | null;
  peso_saida: number | null;
  usou_solda: boolean | null;
  consumo_solda: number | null;
  colocou_pedra: boolean;
  pedras_colocadas: PedraItem[];
  status: string;
  foto_recebimento: string | null;
  foto_conclusao: string | null;
  foto_fio_solda: string | null;
  recebido_em: string | null;
  concluido_em: string | null;
  created_at: string;
  numero_ordem: string;
  tipo_ordem: string;
  detalhes_ordem: string | null;
  foto_peca_servico: string | null;
  peso_peca_servico: number | null;
  cliente_nome: string | null;
  operador_nome: string | null;
  concluido_por_nome: string | null;
}

interface PedraItem {
  insumo_id?: number;
  nome?: string;
  qtd: number;
  peso_unitario?: number;
  peso_total?: number;
  origem?: string;
}

interface TentativaRow {
  id: number;
  tentativa: number;
  status: string;
  peso_saida: number | null;
  consumo_solda: number | null;
  foto_conclusao: string | null;
  concluido_em: string | null;
  operador_nome: string | null;
}

interface Props {
  servico: ServicoRow | null;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function duracao(inicio?: string | null, fim?: string | null): string {
  if (!inicio || !fim) return "—";
  const diff = Math.max(0, new Date(fim).getTime() - new Date(inicio).getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

const TIPO_LABEL: Record<string, string> = {
  servico_venda: "SERVIÇO",
  garantia:      "GARANTIA",
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  aguardando:  { label: "Aguardando",    color: "#92400e", bg: "#fef3c7" },
  em_servico:  { label: "Em serviço",    color: "#1e40af", bg: "#dbeafe" },
  concluido:   { label: "Concluído",     color: "#065f46", bg: "#d1fae5" },
  reprovado:   { label: "Reprovado",     color: "#991b1b", bg: "#fee2e2" },
};

function Badge({ tipo }: { tipo: string }) {
  const isServico = tipo === "servico_venda";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded"
      style={{ backgroundColor: isServico ? "#fef9c3" : "#dbeafe", color: isServico ? "#713f12" : "#1e3a8a" }}>
      {TIPO_LABEL[tipo] ?? tipo.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, color: "#374151", bg: "#f3f4f6" };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded"
      style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-100">
      <span className="text-xs text-gray-500 shrink-0 mr-3">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ServiceDetalheDrawer({ servico, onClose }: Props) {
  const [zoomFoto, setZoomFoto]         = useState<string | null>(null);
  const [tentativas, setTentativas]     = useState<TentativaRow[]>([]);
  const [loadingTent, setLoadingTent]   = useState(false);

  useEffect(() => {
    if (!servico || servico.tentativa <= 1) return;
    setLoadingTent(true);
    fetch(`/api/service/painel?ordem_id=${servico.ordem_id}`)
      .then(r => r.json())
      .then(data => setTentativas((data.servicos ?? []) as TentativaRow[]))
      .catch(() => {})
      .finally(() => setLoadingTent(false));
  }, [servico?.ordem_id, servico?.tentativa]);

  if (!servico) return null;

  const difPeso = servico.peso_saida != null && servico.peso_entrada != null
    ? servico.peso_saida - servico.peso_entrada
    : null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0"
          style={{ backgroundColor: "#184036" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white">{servico.numero_ordem}</span>
            <Badge tipo={servico.tipo_ordem} />
            <StatusBadge status={servico.status} />
            {servico.tentativa > 1 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#fed7aa", color: "#7c2d12" }}>
                {servico.tentativa}ª tentativa
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Info */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <User size={12} /> Informações
            </h3>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-1">
              <InfoRow label="Cliente"   value={servico.cliente_nome ?? "—"} />
              <InfoRow label="Operador"  value={servico.operador_nome ?? "Sem operador"} />
              {servico.detalhes_ordem && <InfoRow label="Detalhes" value={servico.detalhes_ordem} />}
            </div>
          </section>

          {/* Pesos */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Scale size={12} /> Pesos
            </h3>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-1">
              <InfoRow label="Entrada"  value={servico.peso_entrada  != null ? `${servico.peso_entrada.toFixed(3)}g`  : "—"} />
              <InfoRow label="Saída"    value={servico.peso_saida    != null ? `${servico.peso_saida.toFixed(3)}g`    : "—"} />
              {difPeso != null && (
                <InfoRow label="Diferença" value={
                  <span style={{ color: difPeso >= 0 ? "#059669" : "#dc2626" }}>
                    {difPeso >= 0 ? "+" : ""}{difPeso.toFixed(3)}g
                  </span>
                } />
              )}
            </div>
          </section>

          {/* Solda */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Flame size={12} /> Solda
            </h3>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-1">
              {servico.usou_solda ? (
                <>
                  <InfoRow label="Consumo"         value={servico.consumo_solda != null ? `${servico.consumo_solda.toFixed(3)}g` : "—"} />
                  <InfoRow label="Fio antes"        value={null} />
                </>
              ) : (
                <InfoRow label="Solda" value="Não usou" />
              )}
            </div>
          </section>

          {/* Pedras */}
          {servico.colocou_pedra && servico.pedras_colocadas?.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Gem size={12} /> Pedras colocadas
              </h3>
              <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100">
                {servico.pedras_colocadas.map((p, i) => (
                  <div key={i} className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="font-medium text-gray-700">{p.nome ?? `Insumo #${p.insumo_id}`}</span>
                    <div className="text-right text-gray-500">
                      <div>{p.qtd}x · {p.peso_total?.toFixed(3)}g</div>
                      <div className="text-[10px]">{p.origem === "estoque" ? "Do estoque" : "Do cliente"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tempo */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Clock size={12} /> Tempo
            </h3>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-1">
              <InfoRow label="Recebido em"  value={fmt(servico.recebido_em)} />
              <InfoRow label="Concluído em" value={fmt(servico.concluido_em)} />
              <InfoRow label="Duração"      value={duracao(servico.recebido_em, servico.concluido_em)} />
              {servico.concluido_por_nome && <InfoRow label="Concluído por" value={servico.concluido_por_nome} />}
            </div>
          </section>

          {/* Fotos */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ImageIcon size={12} /> Fotos
            </h3>
            <div className="space-y-3">
              {[
                { label: "Entrada na loja",           url: servico.foto_peca_servico  },
                { label: "Recebido pelo operador",     url: servico.foto_recebimento   },
                { label: "Peça concluída",             url: servico.foto_conclusao     },
                { label: "Fio na balança",             url: servico.foto_fio_solda     },
              ].filter(f => f.url).map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <button onClick={() => setZoomFoto(f.url!)} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url!} alt={f.label} className="w-16 h-16 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                  </button>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{f.label}</p>
                    <p className="text-[10px] text-gray-400">Clique para ampliar</p>
                  </div>
                </div>
              ))}
              {!servico.foto_recebimento && !servico.foto_conclusao && !servico.foto_peca_servico && (
                <p className="text-xs text-gray-400">Nenhuma foto disponível</p>
              )}
            </div>
          </section>

          {/* Histórico tentativas */}
          {servico.tentativa > 1 && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                Histórico de tentativas
              </h3>
              {loadingTent ? (
                <p className="text-xs text-gray-400">Carregando...</p>
              ) : (
                <div className="space-y-2">
                  {tentativas.map((t) => (
                    <div key={t.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-700">Tentativa {t.tentativa}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {t.peso_saida != null && <div>Peso saída: {t.peso_saida.toFixed(3)}g</div>}
                        {t.consumo_solda != null && <div>Consumo solda: {t.consumo_solda.toFixed(3)}g</div>}
                        {t.operador_nome && <div>Operador: {t.operador_nome}</div>}
                        {t.concluido_em && <div>Em: {fmt(t.concluido_em)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Zoom foto */}
      {zoomFoto && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={() => setZoomFoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomFoto} alt="Zoom" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
