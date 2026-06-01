"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ComentariosOrdem from "@/components/ComentariosOrdem";
import GaleriaFotosOrdem from "@/components/ordem/GaleriaFotosOrdem";
import ItensOrdemSection from "@/components/ordens/ItensOrdemSection";
import FichaTecnicaForm, { TIPOS_ITEM, type TipoItem, type FichaTecnicaDados, validarFichaTecnica } from "@/components/ordens/FichaTecnicaForm";
import Ver3DAliancaButton from "@/components/ordens/Ver3DAliancaButton";
import { Pencil, X, Save, Loader2, AlertCircle, Ban } from "lucide-react";
import { formatDateBR } from "@/lib/formatters";
import { formatGravacao } from "@/lib/gravacao";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
  danger: "#DC2626",
  warning: "#F59E0B",
  success: "#10B981",
};

// Labels legíveis para campos JSONB de fichas técnicas ERP
const FICHA_LABELS: Record<string, string> = {
  tipo_item: "Tipo de Item",
  milimetragem: "Largura (mm)",
  numeracao: "Numeração (Aro)",
  modelo: "Modelo",
  modelo_interno: "Modelo Interno",
  modelo_externo: "Modelo Externo",
  tipo_fonte: "Tipo de Fonte",
  texto_gravacao: "Gravação",
  comprimento: "Comprimento",
  tipo_elo: "Tipo de Elo",
  tipo_fecho: "Tipo de Fecho",
  modelo_anel: "Modelo do Anel",
  milimetragem_base_mm: "Milim. Base",
  milimetragem_aro_mm: "Milim. Aro",
  modelo_pingente: "Modelo Pingente",
  modelo_bracelete: "Modelo Bracelete",
  altura_placa: "Altura Placa",
  largura_placa: "Largura Placa",
  espessura_chapa: "Espessura Chapa",
  nome_chapa: "Nome Chapa",
  tipo_tarraxa: "Tipo Tarraxa",
  tipo_pedra: "Tipo de Pedra",
  pedras_detalhadas: "Pedras",
  cor_metal: "Cor do Metal",
  peso_estimado: "Peso Estimado",
  espessura: "Espessura (mm)",
  diametro: "Diâmetro Interno (mm)",
  densidade_ouro: "Densidade Ouro (g/cm³)",
  profundidade_concava: "Profundidade Côncava (mm)",
  dome_porcentagem: "Curvatura (%)",
  has_friso: "Tem Friso",
  friso_kind: "Tipo (Friso/Risco)",
  friso_tipo: "Posição do Friso",
  friso_lado: "Lado do Friso",
  friso_largura: "Largura do Friso (mm)",
  friso_profundidade: "Profundidade do Friso (mm)",
  friso_offset: "Offset do Friso (mm)",
  canal_largura: "Largura do Canal (mm)",
  canal_borda_altura: "Altura da Borda (mm)",
  chanfro_tamanho: "Chanfro (mm)",
  qtd_pedras: "Qtd. Pedras",
  tamanho_pedra: "Tamanho da Pedra (mm)",
  tipo_aplicacao_pedra: "Aplicação da Pedra",
  pedra_fileiras: "Fileiras de Pedra",
  pedra_drill: "Furo Passante",
  pedra_meia_lua: "Meia-Lua",
  pedra_volta_completa: "Volta Completa",
};

// Nomes técnicos antigos que vazaram para o JSONB de fichas_tecnicas (antes
// do helper passar a usar o nome comercial). Normaliza em runtime para que
// ourives veja sempre o mesmo nome do orçamento.
const MODELO_ALIAS: Record<string, string> = {
  "Quadrado Canal": "Bordas Elevadas",
  "QuadradoCanal": "Bordas Elevadas",
  "Boleada Dupla": "Boleada Dentro e Fora",
};
function normalizeModelo(value: unknown): string {
  const s = String(value ?? "");
  return MODELO_ALIAS[s] ?? s;
}
const TIPO_ITEM_LABELS: Record<string, string> = {
  alianca: "Aliança", par_alianca: "Par de Alianças", corrente: "Corrente",
  anel: "Anel", pingente: "Pingente", bracelete: "Bracelete",
  escapulario: "Escapulário", brinco: "Brinco", tornozeleira: "Tornozeleira",
  pulseira: "Pulseira", colar_nome: "Colar com Nome", monograma: "Monograma",
};
function fichaErpLabel(key: string): string {
  // Remove prefixo "1_" ou "2_" e busca label
  const prefixMatch = key.match(/^(\d+)_(.+)$/);
  if (prefixMatch) {
    const [, num, campo] = prefixMatch;
    const base = FICHA_LABELS[campo] ?? campo.replace(/_/g, " ");
    return `${base} (${num})`;
  }
  return FICHA_LABELS[key] ?? key.replace(/_/g, " ");
}

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  "Aguardando":   { bg: "#FEF3C7", color: "#92400E" },
  "Em Andamento": { bg: "#DBEAFE", color: "#1E40AF" },
  "Concluído":    { bg: "#D1FAE5", color: "#065F46" },
  "Cancelado":    { bg: "#FEE2E2", color: "#991B1B" },
  "Novas Ordens": { bg: "#EEF2FF", color: "#4338CA" },
  "Pendência":    { bg: "#FEF3C7", color: "#92400E" },
  "Pendente":     { bg: "#FEF3C7", color: "#92400E" },
};

function Badge({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  const s = STATUS_MAP[label] ?? { bg: "#F3F4F6", color: "#6B7280" };
  const pad = size === "lg" ? "px-3 py-1 text-[13px]" : "px-2.5 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex rounded-full font-semibold ${pad}`}
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {label || "—"}
    </span>
  );
}

// Labels comerciais das pedras/cortes — devem casar com STONE_TYPES e STONE_CUTS
// de src/app/(dashboard)/orcamento/constants.ts. Producao mostra exatamente
// o que a vendedora viu no orcamento (sem valores internos tipo "esmeralda_cut").
const STONE_TIPO_LABELS: Record<string, string> = {
  diamante: "Diamante Natural",
  moissanita: "Moissanita",
  rubi: "Rubi",
  esmeralda: "Esmeralda",
  safira: "Safira",
  zirconia: "Zirconia",
};
const STONE_CORTE_LABELS: Record<string, string> = {
  brilhante: "Brilhante",
  gota: "Gota",
  oval: "Oval",
  princesa: "Princesa",
  esmeralda_cut: "Esmeralda",
  marques: "Marquês",
};
function labelTipoPedra(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  return STONE_TIPO_LABELS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
}
function labelCortePedra(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  return STONE_CORTE_LABELS[s] ?? s;
}

// Formatter compartilhado para os campos da ficha (par e single).
function formatFichaValue(key: string, value: unknown): string {
  if (key === "modelo") return normalizeModelo(value);
  // tipo_pedra (string única do botão "Diamante/Zirconia/...") — normaliza
  // pro mesmo label do orçamento. Aceita tanto "Diamante" (capital) quanto
  // "diamante" (lowercase, vindo do pedras_detalhadas).
  if (key === "tipo_pedra") return labelTipoPedra(value);
  if (key === "pedras_detalhadas" && Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value.map((p: any) => {
      const tipo = labelTipoPedra(p.tipo);
      const detalhes: string[] = [];
      if (p.qtd) detalhes.push(`${p.qtd}x`);
      if (p.tamanho_mm) detalhes.push(`${p.tamanho_mm}mm`);
      if (p.corte) detalhes.push(labelCortePedra(p.corte));
      return `${tipo}${detalhes.length ? ` (${detalhes.join(" · ")})` : ""}`;
    }).filter(Boolean).join(", ") || "—";
  }
  if (key === "peso_estimado" && value != null) return `${Number(value).toFixed(2)}g`;
  if (key === "texto_gravacao") return formatGravacao(value);
  if (key === "has_friso" || key === "pedra_drill" || key === "pedra_meia_lua" || key === "pedra_volta_completa") {
    return value ? "Sim" : "Não";
  }
  if (key === "friso_lado") return value === "LOWER" ? "Inferior" : "Superior";
  if (key === "friso_kind") return value === "risco" ? "Risco" : "Friso";
  if (key === "friso_tipo") {
    const s = String(value ?? "").toLowerCase();
    if (s === "centro") return "Centro";
    if (s === "duplo") return "Duplo";
    if (s === "lateral") return "Lateral";
    return String(value);
  }
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

// Ordem de exibição preferida — agrupa campos correlatos (identificação,
// dimensões, perfil, friso, pedras, gravação). Chaves desconhecidas vão
// pro final na ordem original.
const FICHA_FIELD_ORDER: string[] = [
  "modelo", "numeracao", "cor_metal",
  "milimetragem", "espessura", "diametro", "peso_estimado", "densidade_ouro",
  "profundidade_concava", "dome_porcentagem",
  "canal_largura", "canal_borda_altura", "chanfro_tamanho",
  "has_friso", "friso_kind", "friso_tipo", "friso_lado", "friso_largura", "friso_profundidade", "friso_offset",
  "tipo_pedra", "qtd_pedras", "tamanho_pedra", "tipo_aplicacao_pedra",
  "pedra_fileiras", "pedra_drill", "pedra_meia_lua", "pedra_volta_completa",
  "pedras_detalhadas",
  "texto_gravacao", "tipo_fonte",
];
function sortFichaEntries(entries: [string, unknown][]): [string, unknown][] {
  const idx = new Map(FICHA_FIELD_ORDER.map((k, i) => [k, i]));
  return [...entries].sort((a, b) => {
    const ia = idx.has(a[0]) ? idx.get(a[0])! : 999;
    const ib = idx.has(b[0]) ? idx.get(b[0])! : 999;
    return ia - ib;
  });
}

// Defaults dos labels da ficha — mesma fonte de verdade do orçamento.
// Customizações vêm via config_orcamento.labels_ficha_tecnica (passadas no
// prop labelsFicha).
const FICHA_LABELS_PADRAO: Record<string, string> = {
  modelo:         "Modelo",
  aro:            "Aro",
  largura:        "Largura",
  espessura:      "Espessura",
  prof_concava:   "Prof. côncava",
  chanfro:        "Chanfro",
  larg_canal:     "Larg. canal",
  alt_borda:      "Alt. borda",
  metal:          "Metal",
  friso:          "Friso",
  pedras:         "Pedras",
  fileiras:       "Fileiras",
  furo_passante:  "Furo passante",
  gravacao:       "Gravação",
  peso_estimado:  "Peso estimado",
  peso_total_par: "Peso total do par",
};
function getLabelFicha(chave: string, custom?: Record<string, string>): string {
  const c = custom?.[chave]?.trim();
  return c || FICHA_LABELS_PADRAO[chave] || chave;
}

// Linha "k: v" no formato do modal de ficha do orçamento. Replicada aqui
// pra produção ficar pixel-by-pixel igual ao que a vendedora ve.
function LinhaFichaCompacta({ k, v, bold = false, esmeralda = false }: { k: string; v: string; bold?: boolean; esmeralda?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-gray-500">{k}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""}`} style={{ color: esmeralda ? C.esmeralda : "#374151" }}>{v}</span>
    </div>
  );
}

// Ficha técnica compacta — formato idêntico ao modal "Ficha Técnica do par"
// no orçamento. Usado quando a ordem veio de orçamento de aliança.
// Recebe os DADOS JSONB ja enriquecidos (page.tsx faz merge com orcamento_fichas_tecnicas).
function FichaAliancaCompacta({
  titulo, dados, labelsFicha,
}: {
  titulo: string;
  dados: Record<string, unknown>;
  labelsFicha?: Record<string, string>;
}) {
  const L = (k: string) => getLabelFicha(k, labelsFicha);
  const perfil = String(dados.perfil ?? ""); // pode vir vazio se nao foi salvo
  const modelo = normalizeModelo(dados.modelo);
  const aro = dados.numeracao;
  const diametro = dados.diametro;
  const largura = Number(dados.milimetragem ?? 0);
  const espessura = Number(dados.espessura ?? 0);
  const profCon = dados.profundidade_concava != null ? Number(dados.profundidade_concava) : null;
  const chanfro = dados.chanfro_tamanho != null ? Number(dados.chanfro_tamanho) : null;
  const canalL = dados.canal_largura != null ? Number(dados.canal_largura) : null;
  const canalB = dados.canal_borda_altura != null ? Number(dados.canal_borda_altura) : null;
  const metal = String(dados.cor_metal ?? "—");
  const hasFriso = dados.has_friso === true;
  const friso_kind = String(dados.friso_kind ?? "friso");
  const friso_tipo = String(dados.friso_tipo ?? "lateral");
  const friso_largura = Number(dados.friso_largura ?? 0);
  const friso_profundidade = Number(dados.friso_profundidade ?? 0);
  const qtdPedras = Number(dados.qtd_pedras ?? 0);
  // Pedra: usa o tipo/tamanho do primeiro item em pedras_detalhadas (formato
  // raw como o orçamento usa). Fallback pra tipo_pedra/tamanho_pedra escalares.
  const pedrasArr = Array.isArray(dados.pedras_detalhadas) ? (dados.pedras_detalhadas as Array<Record<string, unknown>>) : [];
  const tipoPedraRaw = String(pedrasArr[0]?.tipo ?? dados.tipo_pedra ?? "").toLowerCase();
  const tamRaw = pedrasArr[0]?.tamanho_mm ?? dados.tamanho_pedra;
  // Remove zeros à direita: "1.50" -> "1.5"
  const tamPedraFmt = tamRaw != null ? String(Number(tamRaw)) : null;
  const fileiras = dados.pedra_fileiras;
  const drill = dados.pedra_drill === true;
  const peso = dados.peso_estimado != null ? Number(dados.peso_estimado) : null;
  // Detecta perfil — usa modelo string como fallback se perfil enum não tá no dados
  const isQuadradoCanal = perfil === "QuadradoCanal" || modelo === "Bordas Elevadas";
  const isConcava = perfil === "Concava" || modelo === "Côncava";
  const isChanfrada = perfil === "Chanfrada";

  return (
    <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: C.cremeBorder }}>
      <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>{titulo}</h4>
      <LinhaFichaCompacta k={L("modelo")}   v={modelo} />
      {aro != null && (
        <LinhaFichaCompacta
          k={L("aro")}
          v={diametro != null ? `${aro} (Ø ${Number(diametro).toFixed(2)}mm)` : String(aro)}
        />
      )}
      <LinhaFichaCompacta k={L("largura")}   v={`${largura.toFixed(2)} mm`} />
      <LinhaFichaCompacta k={L("espessura")} v={`${espessura.toFixed(2)} mm`} />
      {isConcava && profCon != null && (
        <LinhaFichaCompacta k={L("prof_concava")} v={`${profCon.toFixed(2)} mm`} />
      )}
      {isChanfrada && chanfro != null && (
        <LinhaFichaCompacta k={L("chanfro")} v={`${chanfro.toFixed(2)} mm`} />
      )}
      {isQuadradoCanal && (
        <>
          {canalL != null && <LinhaFichaCompacta k={L("larg_canal")} v={`${canalL.toFixed(2)} mm`} />}
          {canalB != null && <LinhaFichaCompacta k={L("alt_borda")}  v={`${canalB.toFixed(2)} mm`} />}
        </>
      )}
      <LinhaFichaCompacta k={L("metal")} v={metal} />
      {hasFriso && (friso_largura > 0 || friso_profundidade > 0) && (
        <LinhaFichaCompacta
          k={L("friso")}
          v={`${friso_kind === "risco" ? "Risco" : "Friso"} ${friso_tipo} · ${friso_largura.toFixed(2)}×${friso_profundidade.toFixed(2)}mm`}
        />
      )}
      {qtdPedras > 0 && (
        <LinhaFichaCompacta
          k={L("pedras")}
          v={`${qtdPedras} un · ${tipoPedraRaw}${tamPedraFmt ? ` · ${tamPedraFmt}mm` : ""}`}
        />
      )}
      {qtdPedras > 0 && isQuadradoCanal && fileiras != null && Number(fileiras) > 0 && (
        <LinhaFichaCompacta k={L("fileiras")} v={String(fileiras)} />
      )}
      {qtdPedras > 0 && (
        <LinhaFichaCompacta k={L("furo_passante")} v={drill ? "Sim" : "Não"} />
      )}
      {(() => {
        const grav = formatGravacao(dados.texto_gravacao);
        if (!grav) return null;
        return <LinhaFichaCompacta k={L("gravacao")} v={grav} />;
      })()}
      {peso != null && (
        <div className="border-t pt-1.5 mt-1.5" style={{ borderColor: C.cremeBorder }}>
          <LinhaFichaCompacta k={L("peso_estimado")} v={`${peso.toFixed(2)} g`} bold esmeralda />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
      <span className="text-[11px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</span>
      <span className={`text-[13px] text-right ${mono ? "font-mono" : ""}`} style={{ color: "#1A1A1A" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function MarcadorBadge({ marcador }: { marcador: string }) {
  const entradas = ["AD", "EM", "EP", "ADD", "EIMD", "EPD", "EA", "ENTRADA", "Sangria"];
  const isEntrada = entradas.includes(marcador ?? "");
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
      style={{
        backgroundColor: isEntrada ? "#D1FAE5" : "#FEE2E2",
        color: isEntrada ? "#065F46" : "#991B1B",
      }}
    >
      {marcador || "—"}
    </span>
  );
}

function PecaClienteCard({ fotoPeca, fotoPeca2, fotoPecaSignedUrl, fotoPeca2SignedUrl, pesoPeca, videoObs }: {
  fotoPeca: string | null;
  fotoPeca2: string | null;
  fotoPecaSignedUrl: string | null;
  fotoPeca2SignedUrl: string | null;
  pesoPeca: number | null;
  videoObs: string | null;
}) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // ordem-fotos é PRIVADO — usa signed URL gerada server-side (TTL 1h).
  // ordem-videos não está na lista de privados — URL pública direta.
  const fotoUrl  = fotoPecaSignedUrl ?? null;
  const fotoUrl2 = fotoPeca2SignedUrl ?? null;
  const videoUrl = videoObs
    ? (videoObs.startsWith("http") ? videoObs : `${SUPABASE_URL}/storage/v1/object/public/ordem-videos/${videoObs}`)
    : null;

  return (
    <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#E8DCC8" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
        Peça do Cliente
      </p>
      <div className="space-y-4">
        <div className="flex gap-5 flex-wrap">
          {fotoUrl && (
            <a href={fotoUrl} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoUrl}
                alt="Foto da peça"
                className="w-32 h-32 object-cover rounded-lg border"
                style={{ borderColor: "#E8DCC8" }}
              />
            </a>
          )}
          {fotoUrl2 && (
            <a href={fotoUrl2} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoUrl2}
                alt="Foto da peça 2"
                className="w-32 h-32 object-cover rounded-lg border"
                style={{ borderColor: "#E8DCC8" }}
              />
            </a>
          )}
          <div className="flex flex-col justify-center gap-2">
            {pesoPeca != null && (
              <div>
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Peso</span>
                <p className="font-mono text-[15px] mt-0.5" style={{ color: "#1A1A1A" }}>{Number(pesoPeca).toFixed(2)}g</p>
              </div>
            )}
            {!fotoUrl && !fotoUrl2 && pesoPeca == null && !videoUrl && (
              <p className="text-[13px]" style={{ color: "#9CA3AF" }}>Sem dados registrados.</p>
            )}
          </div>
        </div>

        {/* Vídeo player inline */}
        {videoUrl && (
          <div>
            <span className="text-[11px] uppercase tracking-wider block mb-2" style={{ color: "#9CA3AF" }}>
              Vídeo de Observação
            </span>
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-64 rounded-xl border bg-black"
              style={{ borderColor: "#E8DCC8" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "ficha" | "apontamentos" | "estoque" | "transferencias";

interface Props {
  ordem: any;
  apontamentos: any[];
  movEstoque: any[];
  transferencias: any[];
  fichaTecnica: any | null;
  timeline: any[];
  userRole: string | null;
  conversaoSku?: any | null;
  fotoPecaSignedUrl?: string | null;
  fotoPeca2SignedUrl?: string | null;
  /** Labels custom da ficha — mesma fonte do modal de orçamento. */
  labelsFicha?: Record<string, string>;
}

// Roles "operacionais" — colaboradores de execução que só precisam ver a
// ficha técnica da peça (não veem Produção, Apontamentos, Mov. Estoque ou
// Transferências). Gestão (admin, gerente, pcp, consultora) vê tudo.
const ROLES_SO_FICHA = ["ourives", "motoboy", "estoquista_fabrica", "estoquista_loja"];

export default function OrdemDetalheClient({ ordem, apontamentos, movEstoque, transferencias, fichaTecnica, timeline, userRole, conversaoSku = null, fotoPecaSignedUrl = null, fotoPeca2SignedUrl = null, labelsFicha = {} }: Props) {
  const router = useRouter();
  const soFicha = userRole != null && ROLES_SO_FICHA.includes(userRole);
  // Ficha Técnica eh o conteudo principal — ourives/gestão precisa ver
  // as especificacoes do orcamento como primeira coisa ao abrir a ordem.
  // Aba "Producao" (PCP zeros) foi removida — ja existe um card "Resultado
  // de Producao" no header quando a ordem esta concluida.
  const [tab, setTab] = useState<Tab>("ficha");
  const [comentariosCount, setComentariosCount] = useState(0);

  // ── Modal de edição (apenas desenvolvedor) ───────────────────────────────
  const [editOpen,    setEditOpen]    = useState(false);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);
  const [canceling,   setCanceling]   = useState(false);
  const [editFields,  setEditFields]  = useState({
    data_entrega:         ordem.data_entrega ? new Date(ordem.data_entrega).toISOString().slice(0, 10) : "",
    detalhes_ordem:       ordem.detalhes_ordem ?? "",
    situacao:             ordem.situacao       ?? "",
    tipo_ordem:           ordem.tipo_ordem     ?? "",
    peso_metal_negociado: ordem.peso_metal_negociado != null ? String(Number(ordem.peso_metal_negociado)) : "",
  });

  async function salvarEdicao() {
    setEditSaving(true);
    setEditError(null);
    const body: Record<string, unknown> = {};
    if (editFields.data_entrega)         body.data_entrega         = editFields.data_entrega;
    if (editFields.detalhes_ordem !== "") body.detalhes_ordem       = editFields.detalhes_ordem;
    if (editFields.situacao !== "")      body.situacao             = editFields.situacao;
    if (editFields.tipo_ordem !== "")    body.tipo_ordem           = editFields.tipo_ordem;
    if (editFields.peso_metal_negociado !== "") body.peso_metal_negociado = parseFloat(editFields.peso_metal_negociado);

    const res = await fetch(`/api/ordens/${ordem.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setEditSaving(false);
    if (!res.ok) { setEditError(data?.error ?? "Erro ao salvar"); return; }
    setEditOpen(false);
    router.refresh();
  }

  // ── Cancelar ordem ──────────────────────────────────────────────────────
  const podeCancelar = ordem.situacao !== "cancelado" && ordem.status !== "concluido";
  async function cancelarOrdem() {
    if (!confirm("Tem certeza que deseja cancelar esta ordem? Esta ação cancela também o PCP vinculado.")) return;
    setCanceling(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/ordens/${ordem.id}/cancelar`, { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      router.refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Erro ao cancelar ordem");
    } finally {
      setCanceling(false);
    }
  }

  // ── Ficha técnica pendente ──────────────────────────────────────────────────
  const ROLES_FICHA = ["desenvolvedor", "admin", "gerente_loja", "consultora"];
  const podeEditarFicha = userRole ? ROLES_FICHA.includes(userRole) : false;
  const [fichaEditOpen, setFichaEditOpen] = useState(false);
  const [fichaDados, setFichaDados] = useState<FichaTecnicaDados | null>(() => {
    if (fichaTecnica?._origem === "erp") return fichaTecnica.dados as FichaTecnicaDados ?? null;
    return null;
  });
  const [fichaLocal, setFichaLocal] = useState<FichaTecnicaDados | null>(null);
  const [fichaSaving, setFichaSaving] = useState(false);
  const [fichaErr, setFichaErr] = useState<string | null>(null);
  const [fichaPendente, setFichaPendente] = useState<boolean>(!!ordem.ficha_pendente);

  async function salvarFicha() {
    if (!fichaLocal) return;
    setFichaSaving(true); setFichaErr(null);
    try {
      const res = await fetch(`/api/ordens/${ordem.id}/ficha-tecnica`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados: fichaLocal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");
      setFichaDados(fichaLocal);
      setFichaPendente(data.ficha_pendente);
      setFichaEditOpen(false);
    } catch (e) {
      setFichaErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setFichaSaving(false);
    }
  }

  const temPcp = !!ordem.pcp_id;
  const pcpConcluido = ordem.pcp_etapas_cod === "5";
  const quebraAlta = Number(ordem.pcp_quebra_pct) > 5;

  /**
   * REGRA DE NEGÓCIO: quando a ordem for concluída via botão de contingência,
   * o timeline deve refletir visualmente o fechamento total do fluxo.
   * O QUE: detecta marcador persistido em detalhes_ordem para ativar modo
   * "concluída pelo sistema" no timeline.
   * POR QUE: evitar interpretação de pendências remanescentes após baixa
   * forçada autorizada pelo responsável.
   * IMPACTO SE REMOVIDO: usuário verá etapas em amarelo/cinza mesmo com a
   * ordem finalizada por contingência, gerando retrabalho e confusão.
   */
  const concluidaPeloSistema = String(ordem.detalhes_ordem ?? "").includes("[CONCLUÍDA PELO SISTEMA");
  const matchConclusaoSistema = String(ordem.detalhes_ordem ?? "").match(/\[CONCLUÍDA PELO SISTEMA em ([^\]]+) por /);
  const dataConclusaoSistema = matchConclusaoSistema?.[1]
    ? new Date(matchConclusaoSistema[1]).toLocaleString("pt-BR")
    : null;

  // Encontrar o passo atual (primeiro não-concluido)
  const passoAtualIdx = timeline.findIndex((ev) => ev.status !== "concluido");

  const fichaCount = fichaTecnica?._origem === "erp_multi" ? (fichaTecnica.fichas?.length ?? 0) : fichaTecnica ? 1 : 0;
  const tabs: { key: Tab; label: string; count?: number }[] = soFicha
    ? [
        // Colaborador (ourives etc.): só ficha técnica
        { key: "ficha", label: "Ficha Técnica", count: fichaCount },
      ]
    : [
        { key: "ficha",          label: "Ficha Técnica",  count: fichaCount },
        { key: "apontamentos",   label: "Apontamentos",   count: apontamentos.length },
        { key: "estoque",        label: "Mov. Estoque",   count: movEstoque.length },
        { key: "transferencias", label: "Transferências", count: transferencias.length },
      ];

  return (
    <>
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button
          onClick={() => router.push("/ordens")}
          className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          ←
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2
              className="text-xl md:text-2xl font-semibold"
              style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
            >
              {ordem.numero_ordem || `Ordem #${ordem.id}`}
            </h2>
            <Badge label={ordem.situacao?.toLowerCase() === "cancelado" ? "Cancelado" : ordem.status} size="lg" />
            {ordem.pcp_bloqueado && (
              <span
                className="px-2 py-0.5 rounded text-[11px] font-semibold"
                style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
              >
                Bloqueado
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            ID {ordem.id} · {ordem.tipo_ordem} · {ordem.rota}
          </p>
        </div>
        {userRole === "desenvolvedor" && (
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-amber-50"
            style={{ borderColor: C.dourado, color: C.dourado }}
          >
            <Pencil size={13} /> Editar
          </button>
        )}
        {podeCancelar && (
          <button
            onClick={cancelarOrdem}
            disabled={canceling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-red-50 disabled:opacity-40"
            style={{ borderColor: C.danger, color: C.danger }}
          >
            {canceling ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
            Cancelar Ordem
          </button>
        )}
      </div>

      {/* Banner ficha pendente */}
      {fichaPendente && ordem.tipo_ordem === "fabricacao" && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-xl border"
          style={{ backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}>
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#D97706" }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Ficha técnica pendente</p>
            <p className="text-xs mt-0.5" style={{ color: "#92400E" }}>
              Esta ordem aguarda preenchimento da ficha técnica antes de ser liberada para o PCP.
            </p>
          </div>
          {podeEditarFicha && (
            <button
              onClick={() => { setFichaLocal(fichaDados ?? undefined as unknown as FichaTecnicaDados); setFichaEditOpen(true); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "#D97706", color: "white" }}
            >
              Preencher ficha
            </button>
          )}
        </div>
      )}

      {/* Modal edição ficha técnica */}
      {fichaEditOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-3 bg-black/40">
          <div className="bg-white rounded-2xl border shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            style={{ borderColor: "#E8DCC8" }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "#E8DCC8" }}>
              <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Ficha Técnica</h3>
              <button onClick={() => setFichaEditOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Tipo do item</label>
                <select
                  className="border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: "#E8DCC8", color: "#374151" }}
                  value={fichaLocal?.tipo_item ?? ""}
                  onChange={e => {
                    const tipo = e.target.value as TipoItem;
                    if (tipo) setFichaLocal({ tipo_item: tipo });
                    else setFichaLocal(null);
                  }}
                >
                  <option value="">— Selecionar tipo —</option>
                  {TIPOS_ITEM.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {fichaLocal && (
                <FichaTecnicaForm dados={fichaLocal} onChange={setFichaLocal} />
              )}
              {fichaErr && (
                <p className="text-xs text-red-600">{fichaErr}</p>
              )}
            </div>
            <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: "#E8DCC8" }}>
              <span className="text-xs" style={{ color: "#6B7280" }}>
                {fichaLocal && validarFichaTecnica(fichaLocal)
                  ? "⚠ Campos incompletos — ordem continuará pendente"
                  : "✓ Ficha completa — ordem será liberada para o PCP"}
              </span>
              <button
                onClick={salvarFicha}
                disabled={fichaSaving || !fichaLocal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: "#184036", color: "#F3EADA" }}
              >
                {fichaSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar ficha
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4 md:space-y-5">

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                Comercial
              </p>
              <InfoRow label="Cliente"        value={ordem.cliente_nome} />
              <InfoRow label="Vendedor(a)"    value={ordem.vendedor_nome ?? ordem.created_by_nome} />
              {ordem.venda_id != null && (
                <div className="flex items-center justify-between py-2 border-b last:border-b-0" style={{ borderColor: C.cremeBorder }}>
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>Venda</span>
                  <Link
                    href={`/vendas/${ordem.venda_id}`}
                    className="text-xs font-medium underline underline-offset-2"
                    style={{ color: C.esmeralda }}
                  >
                    #{ordem.venda_id}
                  </Link>
                </div>
              )}
              {ordem.data_entrega != null && (
                <InfoRow label="Data Entrega" value={formatDateBR(ordem.data_entrega)} />
              )}
              {Number(ordem.peso_metal_negociado) > 0 && (
                <InfoRow label="Peso Negociado" value={`${Number(ordem.peso_metal_negociado).toFixed(2)}g`} mono />
              )}
              {Number(ordem.peso_metal_externo) > 0 && (
                <InfoRow label="Metal Externo" value={`${Number(ordem.peso_metal_externo).toFixed(2)}g`} mono />
              )}
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                Produção
              </p>
              {temPcp && (
                <InfoRow label="PCP" value={`#${ordem.pcp_id} — ${ordem.pcp_etapas}`} />
              )}
              {ordem.pcp_operador_nome && ordem.pcp_operador_nome !== "Sem operador" && (
                <InfoRow label="Operador" value={ordem.pcp_operador_nome} />
              )}
              {ordem.setor_nome && (
                <InfoRow label="Setor Atual" value={ordem.setor_nome} />
              )}
              {Number(ordem.pcp_metal_externo) > 0 && (
                <InfoRow label="Metal Externo" value={`${Number(ordem.pcp_metal_externo).toFixed(2)}g`} mono />
              )}
            </div>
          </div>

          {/* Itens da Ordem (produtos da venda) */}
          <ItensOrdemSection ordemId={ordem.id} />

          {/* Detalhes da Ordem — só exibe quando preenchido */}
          {ordem.detalhes_ordem && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                Detalhes da Ordem
              </p>
              <p
                className="text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{ color: "#374151" }}
              >
                {ordem.detalhes_ordem}
              </p>
            </div>
          )}

          {/* Peça do Cliente / Foto 3D — quando há foto, peso ou video */}
          {(ordem.foto_peca_servico || ordem.foto_peca_servico_2 || ordem.peso_peca_servico != null || ordem.video_observacao) && (
            <PecaClienteCard
              fotoPeca={ordem.foto_peca_servico}
              fotoPeca2={ordem.foto_peca_servico_2 ?? null}
              fotoPecaSignedUrl={fotoPecaSignedUrl}
              fotoPeca2SignedUrl={fotoPeca2SignedUrl}
              pesoPeca={ordem.peso_peca_servico}
              videoObs={ordem.video_observacao}
            />
          )}

          {/* Visualizador 3D da alianca — aparece quando a ordem tem orcamento
              de alianca associado (via venda). Componente faz fetch e se nao
              ha orcamento, nao renderiza nada. */}
          <Ver3DAliancaButton ordemId={Number(ordem.id)} />


          {/* Card PMC — só quando PCP concluído */}
          {pcpConcluido && (
            <div
              className="rounded-xl p-5"
              style={{ background: `linear-gradient(135deg, ${C.esmeralda}, #0F2922)` }}
            >
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: C.sage }}>
                Resultado de Produção (PCP Concluído)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
                {[
                  { label: "Entrada Metal", value: `${Number(ordem.pcp_total_metal || 0).toFixed(2)}g` },
                  { label: "Retorno",       value: `${Number(ordem.pcp_retorno_metal || 0).toFixed(2)}g` },
                  { label: "Peso Final",    value: `${Number(ordem.pcp_peso_final || 0).toFixed(2)}g` },
                  { label: "PMC",           value: `${Number(ordem.pcp_pmc || 0).toFixed(2)}g`, accent: true },
                  { label: "Quebra",        value: `${Number(ordem.pcp_quebra || 0).toFixed(2)}g (${Number(ordem.pcp_quebra_pct || 0).toFixed(1)}%)`, danger: quebraAlta },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-[10px] mb-1" style={{ color: C.sage }}>{item.label}</p>
                    <p
                      className="font-mono text-lg font-semibold"
                      style={{
                        color: item.danger ? "#FCA5A5" : item.accent ? C.dourado : C.creme,
                      }}
                    >
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-0.5 rounded-lg p-0.5 w-fit" style={{ backgroundColor: C.creme }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: tab === t.key ? C.esmeralda : "transparent",
                  color: tab === t.key ? C.creme : "#6B7280",
                }}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-1 opacity-60">({t.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* Aba "Produção" removida — os dados de PCP (peso final, PMC,
              quebra) ja aparecem no card "Resultado de Produção" no topo
              quando a ordem fica concluida. Ourives precisa ver a ficha
              tecnica primeiro ao abrir uma ordem nova. */}

          {/* Tab: Apontamentos */}
          {tab === "apontamentos" && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {apontamentos.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhum apontamento registrado</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: C.esmeralda }}>
                      {["Data", "Tipo", "Insumo", "Qtd", "Depósito", "Setor", "Por"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sage }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apontamentos.map((a, i) => (
                      <tr key={a.id} className="border-b" style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}>
                        <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "#6B7280" }}>
                          {a.data ? new Date(a.data).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium" style={{ color: "#1A1A1A" }}>{a.tipo_descricao || "—"}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{a.insumo_nome || "—"}</td>
                        <td className="px-3 py-2 font-mono text-sm font-semibold" style={{ color: C.dourado }}>{a.qtd}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{a.deposito_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{a.setor_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#9CA3AF" }}>{a.criado_por || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Movimentações Estoque */}
          {tab === "estoque" && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {movEstoque.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhuma movimentação de estoque</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: C.esmeralda }}>
                      {["Data", "Marcador", "Entrada", "Saída", "Insumo", "Depósito", "Setor"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sage }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movEstoque.map((m, i) => (
                      <tr key={m.id} className="border-b" style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}>
                        <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "#6B7280" }}>
                          {m.date_created ? new Date(m.date_created).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2"><MarcadorBadge marcador={m.marcador} /></td>
                        <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: C.success }}>
                          {Number(m.entrada) > 0 ? Number(m.entrada).toFixed(2) : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: C.danger }}>
                          {Number(m.saida) > 0 ? Number(m.saida).toFixed(2) : ""}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{m.insumo_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.deposito_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.setor_nome || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Transferências */}
          {tab === "transferencias" && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {transferencias.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhuma transferência registrada</p>
              ) : (
                <div>
                  {transferencias.map((t, i) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-4 px-5 py-3 border-b"
                      style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: "#E8F0ED", color: C.esmeralda }}
                      >
                        →
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px]" style={{ color: "#1A1A1A" }}>
                          {t.setor_nome || "Setor desconhecido"}
                          {t.deposito_nome ? ` · ${t.deposito_nome}` : ""}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{t.criado_por}</p>
                      </div>
                      <p className="font-mono text-[11px]" style={{ color: "#9CA3AF" }}>
                        {t.data ? new Date(t.data).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Ficha Técnica */}
          {tab === "ficha" && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              {!fichaTecnica ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma ficha técnica vinculada a esta ordem.</p>
                  <p className="text-[11px] mt-1" style={{ color: "#C4B5A0" }}>A ficha é criada pelo PDV no Directus ao lançar a ordem.</p>
                </div>
              ) : fichaTecnica._origem === "erp_multi" ? (
                /* ── Par de alianças — formato igual ao modal do orçamento ── */
                (() => {
                  const fichas = fichaTecnica.fichas as Array<{ ficha_id: number; dados: unknown; _label: string; tipo_item?: string }>;
                  const dadosArr = fichas.map(f => (typeof f.dados === "string" ? JSON.parse(f.dados) : f.dados) as Record<string, unknown>);
                  const ehAlianca = fichas.every(f => f.tipo_item === "alianca" || f.tipo_item === "par_alianca");
                  if (ehAlianca) {
                    const pesoTotal = dadosArr.reduce((acc, d) => acc + Number(d?.peso_estimado ?? 0), 0);
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {fichas.map((f, idx) => (
                            <FichaAliancaCompacta
                              key={f.ficha_id}
                              titulo={f._label}
                              dados={dadosArr[idx]}
                              labelsFicha={labelsFicha}
                            />
                          ))}
                        </div>
                        <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder, backgroundColor: "#F0F7F4" }}>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>
                              {getLabelFicha("peso_total_par", labelsFicha)}
                            </span>
                            <span className="font-mono font-bold" style={{ color: C.esmeralda }}>
                              {pesoTotal.toFixed(2)} g
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-right" style={{ color: "#C4B5A0" }}>
                          Fichas {fichas.map(f => "#" + f.ficha_id).join(" · ")}
                        </p>
                      </div>
                    );
                  }
                  // Fallback genérico (peças não-aliança)
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {fichas.map((f, idx) => {
                        const entries = sortFichaEntries(
                          Object.entries(dadosArr[idx] ?? {}).filter(
                            ([k, v]) => k !== "tipo_item" && v != null && v !== "" && (!Array.isArray(v) || v.length > 0)
                          ) as [string, unknown][]
                        );
                        return (
                          <div key={idx} className="bg-white rounded-xl border p-4" style={{ borderColor: C.cremeBorder }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: C.esmeralda }}>
                              {f._label}
                            </p>
                            <div>
                              {entries.map(([key, value]) => (
                                <InfoRow key={key} label={fichaErpLabel(key)} value={formatFichaValue(key, value)} />
                              ))}
                            </div>
                            <p className="text-[10px] text-right mt-2" style={{ color: "#C4B5A0" }}>Ficha #{f.ficha_id}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : fichaTecnica._origem === "erp" ? (
                /* ── Ficha ERP única — formato compacto p/ aliança, genérico p/ outros ── */
                (() => {
                  const dados = (typeof fichaTecnica.dados === "string" ? JSON.parse(fichaTecnica.dados) : fichaTecnica.dados) as Record<string, unknown>;
                  const tipoItem = String(dados?.tipo_item ?? fichaTecnica.tipo_item ?? "");
                  if (tipoItem === "alianca" || tipoItem === "par_alianca") {
                    return (
                      <div className="space-y-3">
                        <FichaAliancaCompacta
                          titulo="Especificações"
                          dados={dados}
                          labelsFicha={labelsFicha}
                        />
                        <p className="text-[10px] text-right" style={{ color: "#C4B5A0" }}>Ficha #{fichaTecnica.ficha_id}</p>
                      </div>
                    );
                  }
                  const entries = sortFichaEntries(
                    Object.entries(dados ?? {}).filter(
                      ([k, v]) => k !== "tipo_item" && v != null && v !== "" && (!Array.isArray(v) || v.length > 0)
                    ) as [string, unknown][]
                  );
                  return (
                    <div className="space-y-5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                          {TIPO_ITEM_LABELS[tipoItem] ?? tipoItem ?? "Ficha Técnica"}
                        </p>
                        <div className="grid grid-cols-2 gap-x-8">
                          {entries.map(([key, value]) => (
                            <InfoRow key={key} label={fichaErpLabel(key)} value={formatFichaValue(key, value)} />
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-right" style={{ color: "#C4B5A0" }}>Ficha #{fichaTecnica.ficha_id}</p>
                    </div>
                  );
                })()
              ) : (
                /* ── Ficha Directus (legado, colunas fixas) ── */
                <div className="space-y-5">
                  {[
                    {
                      titulo: "Medições",
                      campos: [
                        ["Milimetragem 1", fichaTecnica.milimetragem_1 != null ? `${fichaTecnica.milimetragem_1} mm` : null],
                        ["Milimetragem 2", fichaTecnica.milimetragem_2 != null ? `${fichaTecnica.milimetragem_2} mm` : null],
                        ["Numeração 1", fichaTecnica.numeracao],
                        ["Numeração 2", fichaTecnica.numeracao_2],
                        ["Comprimento", fichaTecnica.comprimento != null ? `${fichaTecnica.comprimento} mm` : null],
                      ],
                    },
                    {
                      titulo: "Modelo",
                      campos: [
                        ["Modelo 1", fichaTecnica.modelo_1_label ?? fichaTecnica.modelo_1],
                        ["Modelo Interno 1", fichaTecnica.modelo_interno_1_label ?? fichaTecnica.modelo_interno_1],
                        ["Outro Modelo 1", fichaTecnica.outro_modelo_1],
                        ["Modelo 2", fichaTecnica.modelo_2_label ?? fichaTecnica.modelo_2],
                        ["Modelo Interno 2", fichaTecnica.modelo_interno_2_label ?? fichaTecnica.modelo_interno_2],
                        ["Outro Modelo 2", fichaTecnica.outro_modelo_2],
                        ["Modelo Externo Anel", fichaTecnica.modelo_externo_anel],
                      ],
                    },
                    {
                      titulo: "Gravação",
                      campos: [
                        ["Tipo Fonte 1", fichaTecnica.tipo_fonte_1_label ?? fichaTecnica.tipo_fonte_1],
                        ["Texto 1", fichaTecnica.texto_tipo_fonte_1],
                        ["Tipo Fonte 2", fichaTecnica.tipo_fonte_2_label ?? fichaTecnica.tipo_fonte_2],
                        ["Texto 2", fichaTecnica.texto_tipo_fonte_2],
                      ],
                    },
                    {
                      titulo: "Corrente / Pulseira",
                      campos: [
                        ["Tipo Elo", fichaTecnica.tipo_elo_label ?? fichaTecnica.tipo_elo],
                        ["Outro Elo", fichaTecnica.outro_tipo_elo],
                        ["Tipo Fecho", fichaTecnica.tipo_fecho_label ?? fichaTecnica.tipo_fecho],
                        ["Outro Fecho", fichaTecnica.outro_tipo_fecho],
                        ["Modelo Bracelete", fichaTecnica.modelo_bracelete],
                      ],
                    },
                    {
                      titulo: "Pingente",
                      campos: [
                        ["Modelo", fichaTecnica.modelo_pingente_label ?? fichaTecnica.modelo_pingente],
                        ["Outro Modelo", fichaTecnica.outro_modelo_pingente],
                        ["Altura", fichaTecnica.altura_pingente != null ? `${fichaTecnica.altura_pingente} mm` : null],
                        ["Largura", fichaTecnica.largura_pingente != null ? `${fichaTecnica.largura_pingente} mm` : null],
                      ],
                    },
                    {
                      titulo: "Anel",
                      campos: [
                        ["Modelo Anel", fichaTecnica.modelo_anel],
                        ["Milim. Base", fichaTecnica.milimetragem_da_base != null ? `${fichaTecnica.milimetragem_da_base} mm` : null],
                        ["Milim. Aro", fichaTecnica.milimetragem_do_aro != null ? `${fichaTecnica.milimetragem_do_aro} mm` : null],
                        ["Modelo Interno", fichaTecnica.modelo_interno_anel],
                      ],
                    },
                    {
                      titulo: "Placa / Chapa",
                      campos: [
                        ["Altura Placa", fichaTecnica.altura_placa != null ? `${fichaTecnica.altura_placa} mm` : null],
                        ["Largura Placa", fichaTecnica.largura_placa != null ? `${fichaTecnica.largura_placa} mm` : null],
                        ["Espessura Chapa", fichaTecnica.expessura_chapa != null ? `${fichaTecnica.expessura_chapa} mm` : null],
                        ["Nome Chapa", fichaTecnica.nome_chapa],
                        ["Tipo Tarraxa", fichaTecnica.tipo_tarraxa],
                      ],
                    },
                  ].map((grupo) => {
                    const visiveis = grupo.campos.filter(([, v]) => v != null && v !== "");
                    if (visiveis.length === 0) return null;
                    return (
                      <div key={grupo.titulo}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>{grupo.titulo}</p>
                        <div className="grid grid-cols-2 gap-x-8">
                          {visiveis.map(([label, value]) => (
                            <InfoRow key={label} label={label} value={String(value)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-right" style={{ color: "#C4B5A0" }}>Ficha #{fichaTecnica.ficha_id}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <p className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>Timeline</p>
            <div>
              {timeline.map((ev, i) => {
                const isConcluido  = concluidaPeloSistema || ev.status === "concluido";
                const isAtual      = !concluidaPeloSistema && i === passoAtualIdx;
                const isPendente   = !concluidaPeloSistema && ev.status === "pendente" && !isAtual;

                const dotColor = isConcluido ? C.esmeralda : isAtual ? C.dourado : C.cremeBorder;
                const labelColor = isConcluido ? "#1A1A1A" : isAtual ? C.dourado : "#C4B5A0";

                return (
                  <div key={ev.passo} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${isAtual ? "animate-pulse" : ""}`}
                        style={{ backgroundColor: dotColor }}
                      />
                      {i < timeline.length - 1 && (
                        <div className="w-px flex-1 min-h-[28px] mt-1" style={{ backgroundColor: isConcluido ? C.esmeralda : C.cremeBorder, opacity: isConcluido ? 0.3 : 1 }} />
                      )}
                    </div>
                    <div className="pb-4 min-w-0">
                      <p
                        className="text-[13px] font-medium leading-tight"
                        style={{ color: labelColor }}
                      >
                        {ev.evento}
                        {isAtual && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.dourado }}>
                            atual
                          </span>
                        )}
                      </p>
                      {ev.detalhe && !isPendente && (
                        <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{ev.detalhe}</p>
                      )}
                      {concluidaPeloSistema && (
                        <p className="text-[11px] mt-0.5" style={{ color: "#059669" }}>
                          Concluída pelo sistema{dataConclusaoSistema ? ` em ${dataConclusaoSistema}` : ""}
                        </p>
                      )}
                      {ev.data_evento && (
                        <p className="font-mono text-[10px] mt-0.5" style={{ color: "#C4B5A0" }}>
                          {new Date(ev.data_evento).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resumo rápido */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <p className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>Resumo</p>
            <div className="space-y-2">
              {[
                { label: "Apontamentos",   value: apontamentos.length },
                { label: "Mov. Estoque",   value: movEstoque.length },
                { label: "Transferências", value: transferencias.length },
                ordem.pcp_total_pedras_un > 0 && { label: "Pedras",       value: `${ordem.pcp_total_pedras_un} un` },
                ordem.dist_id && { label: "Distribuição",  value: `#${ordem.dist_id}` },
              ].filter(Boolean).map((item: any) => (
                <div key={item.label} className="flex justify-between text-[12px]">
                  <span style={{ color: "#9CA3AF" }}>{item.label}</span>
                  <span className="font-mono font-medium" style={{ color: "#1A1A1A" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Info extra */}
          <div className="rounded-xl p-4" style={{ backgroundColor: C.creme }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Datas</p>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span style={{ color: "#9CA3AF" }}>Criado</span>
                <span className="font-mono" style={{ color: "#1A1A1A" }}>
                  {ordem.date_created ? new Date(ordem.date_created).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "#9CA3AF" }}>Entrega</span>
                <span className="font-mono" style={{ color: "#1A1A1A" }}>
                  {formatDateBR(ordem.data_entrega)}
                </span>
              </div>
              {ordem.pcp_data_conclusao && (
                <div className="flex justify-between">
                  <span style={{ color: "#9CA3AF" }}>Concluído</span>
                  <span className="font-mono" style={{ color: C.success }}>
                    {new Date(ordem.pcp_data_conclusao).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Galeria de fotos — antes dos comentários */}
      <div className="mt-6">
        <GaleriaFotosOrdem ordemId={ordem.id} />
      </div>

      {/* Comentários — sempre visível, abaixo de tudo */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base font-semibold" style={{ color: "#1A1A1A" }}>
            Comentários
          </span>
          {comentariosCount > 0 && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: "#E8F0ED", color: "#184036" }}
            >
              {comentariosCount}
            </span>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#E8DCC8" }}>
          <ComentariosOrdem
            ordemId={ordem.id}
            onCountChange={setComentariosCount}
          />
        </div>
      </div>
    </div>

    {/* ── Modal de Edição (desenvolvedor) ──────────────────────────────── */}

    {editOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
            <h3 className="font-semibold text-base" style={{ color: C.esmeralda }}>
              Editar {ordem.numero_ordem}
            </h3>
            <button onClick={() => setEditOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
              <X size={16} style={{ color: "#6B7280" }} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Data de Entrega</label>
              <input
                type="date"
                value={editFields.data_entrega}
                onChange={e => setEditFields(f => ({ ...f, data_entrega: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Situação</label>
              <input
                type="text"
                value={editFields.situacao}
                onChange={e => setEditFields(f => ({ ...f, situacao: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
                placeholder="ex: Em Andamento"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Tipo de Ordem</label>
              <input
                type="text"
                value={editFields.tipo_ordem}
                onChange={e => setEditFields(f => ({ ...f, tipo_ordem: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Peso Metal Negociado (g)</label>
              <input
                type="number"
                step="0.01"
                value={editFields.peso_metal_negociado}
                onChange={e => setEditFields(f => ({ ...f, peso_metal_negociado: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono"
                style={{ borderColor: C.cremeBorder }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Detalhes / Observações</label>
              <textarea
                rows={3}
                value={editFields.detalhes_ordem}
                onChange={e => setEditFields(f => ({ ...f, detalhes_ordem: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            {editError && (
              <p className="text-xs font-medium" style={{ color: C.danger }}>{editError}</p>
            )}
          </div>

          <div className="flex gap-3 px-6 pb-5">
            <button
              onClick={() => setEditOpen(false)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-semibold"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarEdicao}
              disabled={editSaving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: "#fff" }}
            >
              {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
