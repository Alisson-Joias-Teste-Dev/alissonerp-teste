"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, Plus, Loader2, CheckCircle,
  Truck, Video, FileText, UserPlus, MapPin, Pencil, User, Package, CreditCard, XCircle,
} from "lucide-react";
import Link from "next/link";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cliente {
  id: number; nome: string; cpf_cnpj: string | null;
  email: string | null; telefone: string | null; celular?: string | null;
  endereco?: string | null; numero?: string | null; complemento?: string | null;
  bairro?: string | null; municipio?: string | null; cep?: string | null; uf?: string | null;
}
interface Produto {
  id: number; sku: string; nome: string;
  preco_venda: number | null; peso_precificado: number | null;
  unidade: string | null; sufixo_variacao: string | null; numeracao: string | null;
}
interface FaixaComissao { desconto_pct: number; comissao_pct: number; }
interface ItemVenda {
  _key: string; produto_id: number; nome_produto: string; sku: string;
  quantidade: number; preco_lista: number; pct_desconto: number;
  preco_unitario: number; total_item: number; pct_comissao: number;
  valor_comissao: number; peso_estimado: number | null; unidade: string | null;
}
interface Pagamento { _key: string; forma: string; valor: number; parcelas: number; }
interface ParcelaRow { num: number; dias: number; data: string; valor: number; }
interface Vendedor { id_vendedor: number; nome: string; }
interface FormaEnvio { id: number; nome: string; id_api: string; }
interface FormaFrete { id: number; nome: string; codigo: string; id_api_logistica: string; }

const FORMAS_PAGAMENTO = [
  "Dinheiro", "Cartão de Crédito", "Cartão de Débito",
  "Vale-Troca", "Pix", "Ouro", "A Receber", "Múltiplas",
];
const GATEWAYS   = ["Mercado Pago", "PagSeguro", "Cielo", "Stone", "Getnet", "Rede", "Outro"];
const BANDEIRAS  = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outro"];
const CONDICOES  = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];

// formas que exibem tabela de parcelas
const COM_PARCELAS = ["Cartão de Crédito", "Ouro", "A Receber", "Pix", "Vale-Troca"];
// formas que exibem gateway/bandeira
const COM_CARTAO   = ["Cartão de Crédito", "Cartão de Débito"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function hoje() { return new Date().toISOString().slice(0, 10); }
function uid() { return Math.random().toString(36).slice(2); }
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDateBR(iso: string) {
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}
function isoFromBR(br: string) {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}

interface Props { role: string; vendedorId: number | null; maxDesconto: number; }
const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── Autocomplete ─────────────────────────────────────────────────────────────
function Autocomplete<T>({ placeholder, onSearch, renderItem, onSelect, selectedLabel, onClear }: {
  placeholder: string; onSearch: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode; onSelect: (item: T) => void;
  selectedLabel?: string | null; onClear: () => void;
}) {
  const [q, setQ] = useState(""); const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const r = await onSearch(val); setResults(r); setOpen(true); setLoading(false);
    }, 300);
  }, [onSearch]);

  if (selectedLabel) return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border" style={{ borderColor: C.cremeBorder }}>
      <span className="text-sm" style={{ color: "#374151" }}>{selectedLabel}</span>
      <button onClick={onClear} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
    </div>
  );
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
        {loading ? <Loader2 size={13} className="animate-spin text-gray-400" /> : <Search size={13} style={{ color: "#9CA3AF" }} />}
        <input className="flex-1 outline-none text-sm" style={{ color: "#1A1A1A" }} placeholder={placeholder} value={q}
          onChange={e => { setQ(e.target.value); search(e.target.value); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg overflow-hidden bg-white" style={{ borderColor: C.cremeBorder, maxHeight: 240 }}>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {results.map((item, i) => (
              <button key={i} className="w-full text-left px-3 py-2.5 hover:bg-stone-50 text-sm border-b last:border-b-0" style={{ borderColor: C.creme }}
                onMouseDown={() => { onSelect(item); setQ(""); setOpen(false); setResults([]); }}>
                {renderItem(item)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section card (mesmo padrão da tela de detalhe) ──────────────────────────
function Section({ icon: Icon, title, children }: {
  icon: any; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border" style={{ borderColor: C.cremeBorder }}>
      <div
        className="flex items-center gap-2 px-4 py-3 border-b rounded-t-xl"
        style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}
      >
        <Icon size={14} style={{ color: C.esmeralda }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.esmeralda }}>
          {title}
        </span>
      </div>
      <div className="p-4 bg-white rounded-b-xl">{children}</div>
    </div>
  );
}
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${className}`} style={{ borderColor: C.cremeBorder, color: "#374151" }} {...props} />;
}
function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${className}`} style={{ borderColor: C.cremeBorder, color: "#374151" }} {...props} />;
}
function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-6 border-b ${className}`} style={{ borderColor: C.cremeBorder }}>{children}</div>;
}
function STitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mb-4" style={{ color: "#1A1A1A" }}>{children}</h3>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function NovaVendaClient({ role, vendedorId, maxDesconto }: Props) {
  const router = useRouter();
  const isFullAccess = FULL_ACCESS.includes(role);

  // Refs de dados
  const [faixas, setFaixas] = useState<FaixaComissao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [formaEnvioOpts, setFormaEnvioOpts] = useState<FormaEnvio[]>([]);
  const [formaFreteAll, setFormaFreteAll] = useState<FormaFrete[]>([]);

  // Form
  const [cliente,       setCliente]       = useState<Cliente | null>(null);
  const [vendedorSel,   setVendedorSel]   = useState<number | "">(vendedorId ?? "");
  const [dataVenda,     setDataVenda]     = useState(hoje());
  const [dataEntrega,   setDataEntrega]   = useState("");
  const [totalFrete,    setTotalFrete]    = useState(0);
  const [formaEnvioId,  setFormaEnvioId]  = useState<number | "">("");
  const [formaFreteId,  setFormaFreteId]  = useState<number | "">("");
  const [observacoes,   setObservacoes]   = useState("");
  const [obsInternas,   setObsInternas]   = useState("");

  // Vídeo
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoObsInterna, setVideoObsInterna] = useState<string | null>(null);
  const [uploadingVideo,  setUploadingVideo]  = useState(false);
  const [videoUploadErr,  setVideoUploadErr]  = useState("");

  // Modals & delivery address
  const [showDadosCliente, setShowDadosCliente] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showEndEntrega, setShowEndEntrega] = useState(false);
  const [mesmoEndereco, setMesmoEndereco] = useState(true);
  const [endEntrega, setEndEntrega] = useState({ cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" });
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
  const [savingCliente, setSavingCliente] = useState(false);
  const [clienteErr, setClienteErr] = useState("");
  const [editingCliente, setEditingCliente] = useState(false);
  const [editClienteForm, setEditClienteForm] = useState({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });

  // Itens
  const [itens,       setItens]       = useState<ItemVenda[]>([]);
  const [produtoSel,  setProdutoSel]  = useState<Produto | null>(null);
  const [qtd,         setQtd]         = useState(1);
  const [pctDesconto, setPctDesconto] = useState(0);
  const [descontoErr, setDescontoErr] = useState("");
  const [addingItem,  setAddingItem]  = useState(false);
  void 0; // prodTab removido — itens exibidos em cards

  // Pagamentos
  const [pagForma,       setPagForma]       = useState("Dinheiro");
  const [pagGateway,     setPagGateway]     = useState("Mercado Pago");
  const [pagBandeira,    setPagBandeira]    = useState("Outro");
  const [pagCondicao,    setPagCondicao]    = useState("À vista");
  const [parcelasRows,   setParcelasRows]   = useState<ParcelaRow[]>([]);
  // Múltiplas
  const [pagamentos,     setPagamentos]     = useState<Pagamento[]>([]);
  const [pagMultForma,   setPagMultForma]   = useState("Dinheiro");
  const [pagValor,       setPagValor]       = useState("");

  // Submit
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Carregar dados de referência
  useEffect(() => {
    fetch("/api/vendas/faixas-comissao").then(r => r.json()).then(setFaixas).catch(() => {});
    fetch("/api/vendas/forma-envio").then(r => r.json()).then((d: { envio: FormaEnvio[]; frete: FormaFrete[] }) => {
      setFormaEnvioOpts(d.envio ?? []);
      setFormaFreteAll(d.frete ?? []);
    }).catch(() => {});
    if (isFullAccess) fetch("/api/vendedores").then(r => r.json()).then(setVendedores).catch(() => {});
  }, [isFullAccess]);

  // Formas de frete disponíveis para o envio selecionado
  const formaFreteOpts = formaFreteAll.filter(f => {
    const envio = formaEnvioOpts.find(e => e.id === formaEnvioId);
    return envio ? f.id_api_logistica === envio.id_api : false;
  });

  // ── Comissão ────────────────────────────────────────────────────────────────
  function getComissao(pct: number): number {
    const faixa = faixas.find(f => f.desconto_pct === Math.round(pct));
    if (!faixa || pct > 30) return 0;
    return faixa.comissao_pct;
  }

  function calcItem(produto: Produto, q: number, pct: number): Omit<ItemVenda, "_key"> {
    const precoLista  = produto.preco_venda ?? 0;
    const precoUnit   = precoLista * (1 - pct / 100);
    const totalItem   = precoUnit * q;
    const pctComissao = getComissao(pct);
    return {
      produto_id: produto.id, nome_produto: produto.nome, sku: produto.sku,
      quantidade: q, preco_lista: precoLista, pct_desconto: pct,
      preco_unitario: precoUnit, total_item: totalItem,
      pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100,
      peso_estimado: produto.peso_precificado, unidade: produto.unidade,
    };
  }

  function handleAddItem() {
    if (!produtoSel) return;
    if (pctDesconto > maxDesconto) { setDescontoErr(`Máximo: ${maxDesconto}%`); return; }
    setItens(prev => [...prev, { _key: uid(), ...calcItem(produtoSel, qtd, pctDesconto) }]);
    setProdutoSel(null); setQtd(1); setPctDesconto(0); setDescontoErr(""); setAddingItem(false);
  }

  // ── Totais (declarados antes do useEffect que depende de totalVenda) ─────────
  const totalProdutos = itens.reduce((s, i) => s + i.total_item, 0);
  const totalDesconto = itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);
  const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);
  const totalVenda    = totalProdutos + totalFrete;

  // Gerar linhas de parcelas quando condição ou total mudam
  useEffect(() => {
    if (pagForma === "Múltiplas") return;
    const n = pagCondicao === "À vista" ? 1 : parseInt(pagCondicao);
    const base = totalVenda > 0 ? +(totalVenda / n).toFixed(2) : 0;
    const rows: ParcelaRow[] = Array.from({ length: n }, (_, i) => ({
      num: i + 1,
      dias: 30 * (i + 1),
      data: addDays(hoje(), 30 * (i + 1)),
      valor: i === n - 1 ? +(totalVenda - base * (n - 1)).toFixed(2) : base,
    }));
    setParcelasRows(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagCondicao, totalVenda, pagForma]);

  function equalizarParcelas() {
    const n = parcelasRows.length;
    if (!n) return;
    const base = +(totalVenda / n).toFixed(2);
    setParcelasRows(prev => prev.map((r, i) => ({
      ...r,
      valor: i === n - 1 ? +(totalVenda - base * (n - 1)).toFixed(2) : base,
    })));
  }

  function updateParcelaRow(i: number, field: "dias" | "data" | "valor", raw: string) {
    const tv = totalVenda;
    setParcelasRows(prev => {
      const updated = prev.map((r, idx) => {
        if (idx !== i) return r;
        if (field === "dias") {
          const d = parseInt(raw) || 0;
          return { ...r, dias: d, data: addDays(hoje(), d) };
        }
        if (field === "data") {
          if (raw.length !== 10) return { ...r, data: raw };
          const origem = new Date(hoje() + "T12:00:00");
          const destino = new Date(raw + "T12:00:00");
          const dias = Math.round((destino.getTime() - origem.getTime()) / 86400000);
          return { ...r, data: raw, dias };
        }
        return { ...r, valor: parseFloat(raw.replace(",", ".")) || 0 };
      });
      // Ao editar valor de qualquer linha exceto a última, auto-ajusta a última
      if (field === "valor" && i < updated.length - 1) {
        const sumOthers = updated.slice(0, -1).reduce((s, r) => s + r.valor, 0);
        const lastVal = +(tv - sumOthers).toFixed(2);
        updated[updated.length - 1] = { ...updated[updated.length - 1], valor: Math.max(0, lastVal) };
      }
      return updated;
    });
  }

  function handleAddPagamento() {
    const restante = +(totalVenda - pagamentos.reduce((s, p) => s + p.valor, 0)).toFixed(2);
    const v = parseFloat(pagValor.replace(",", "."));
    if (!v || v <= 0 || restante <= 0) return;
    const valorFinal = Math.min(v, restante);
    setPagamentos(prev => [...prev, { _key: uid(), forma: pagMultForma, valor: valorFinal, parcelas: 1 }]);
    setPagValor("");
  }

  // ── Vídeo ──────────────────────────────────────────────────────────────────
  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setVideoObsInterna(null); setVideoUploadErr(""); setUploadingVideo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res  = await fetch("/api/vendas/upload-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64, mime: file.type, filename: file.name }) });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setVideoObsInterna(data.url ?? null);
    } catch (err) { setVideoUploadErr(err instanceof Error ? err.message : "Erro ao enviar vídeo"); }
    finally { setUploadingVideo(false); }
  }
  function handleRemoveVideo() {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null); setVideoObsInterna(null); setVideoUploadErr("");
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  const totalPago     = pagamentos.reduce((s, p) => s + p.valor, 0);
  void totalPago; // usado em modo Múltiplas

  // ── CEP lookup ──────────────────────────────────────────────────────────────
  async function buscaCEP(cep: string, target: "entrega" | "novoCliente") {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data.erro) return;
      if (target === "entrega") {
        setEndEntrega(prev => ({ ...prev, logradouro: data.logradouro ?? "", bairro: data.bairro ?? "", cidade: data.localidade ?? "", uf: data.uf ?? "" }));
      } else {
        setNovoClienteForm(prev => ({ ...prev, endereco: data.logradouro ?? "", bairro: data.bairro ?? "", municipio: data.localidade ?? "", uf: data.uf ?? "" }));
      }
    } catch { /* silent */ }
  }

  // ── Edit existing client ────────────────────────────────────────────────────
  function startEditCliente() {
    if (!cliente) return;
    setEditClienteForm({
      nome: cliente.nome ?? "", cpf_cnpj: cliente.cpf_cnpj ?? "", email: cliente.email ?? "",
      telefone: cliente.telefone ?? "", celular: cliente.celular ?? "", cep: cliente.cep ?? "",
      endereco: cliente.endereco ?? "", numero: cliente.numero ?? "", complemento: cliente.complemento ?? "",
      bairro: cliente.bairro ?? "", municipio: cliente.municipio ?? "", uf: cliente.uf ?? "",
    });
    setEditingCliente(true);
  }

  async function handleSalvarCliente() {
    if (!cliente) return;
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cliente.id, ...editClienteForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCliente({ ...cliente, ...data });
      setEditingCliente(false);
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSavingCliente(false); }
  }

  // ── Create new client ──────────────────────────────────────────────────────
  async function handleCriarCliente() {
    if (!novoClienteForm.nome.trim()) { setClienteErr("Nome é obrigatório"); return; }
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoClienteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCliente({ id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, email: data.email, telefone: data.telefone, celular: data.celular, endereco: data.endereco, numero: data.numero, complemento: data.complemento, bairro: data.bairro, municipio: data.municipio, cep: data.cep, uf: data.uf });
      setShowNovoCliente(false);
      setNovoClienteForm({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao criar cliente"); }
    finally { setSavingCliente(false); }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit(situacao: "rascunho" | "aprovado") {
    setSaving(true); setSaveErr("");
    try {
      const envioNome  = formaEnvioOpts.find(e => e.id === formaEnvioId)?.nome ?? "";
      const freteNome  = formaFreteAll.find(f => f.id === formaFreteId)?.nome ?? "";
      const body = {
        cliente_id: cliente?.id ?? null,
        vendedor_id: vendedorSel || null,
        data_entrega: dataEntrega || null,
        total_frete: totalFrete,
        forma_envio: envioNome || null,
        forma_frete: freteNome || null,
        observacoes: observacoes || null,
        observacoes_internas: obsInternas || null,
        video_obs_interna: videoObsInterna,
        ...(!mesmoEndereco && showEndEntrega ? {
          endereco_entrega: endEntrega.logradouro || null,
          endereco_entrega_numero: endEntrega.numero || null,
          endereco_entrega_complemento: endEntrega.complemento || null,
          endereco_entrega_bairro: endEntrega.bairro || null,
          endereco_entrega_cidade: endEntrega.cidade || null,
          endereco_entrega_cep: endEntrega.cep || null,
          endereco_entrega_uf: endEntrega.uf || null,
        } : {}),
        itens: itens.map(i => ({
          produto_id: i.produto_id, nome_produto: i.nome_produto, sku: i.sku,
          quantidade: i.quantidade, preco_lista: i.preco_lista, pct_desconto: i.pct_desconto,
          preco_unitario: i.preco_unitario, total_item: i.total_item,
          pct_comissao: i.pct_comissao, valor_comissao: i.valor_comissao, peso_estimado: i.peso_estimado,
        })),
        pagamentos: pagForma === "Múltiplas"
          ? pagamentos.map(p => ({ forma: p.forma, valor: p.valor, parcelas: p.parcelas, status: "pendente" }))
          : [{
              forma: pagForma,
              valor: totalVenda,
              parcelas: pagCondicao === "À vista" ? 1 : parseInt(pagCondicao),
              gateway: COM_CARTAO.includes(pagForma) ? pagGateway : null,
              bandeira: COM_CARTAO.includes(pagForma) ? pagBandeira : null,
              status: "pendente",
            }],
      };
      const res  = await fetch("/api/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { id: number; numero_venda: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (situacao === "aprovado") {
        await fetch(`/api/vendas/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ situacao: "aprovado" }) });
      }
      router.push("/vendas");
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao salvar venda"); }
    finally { setSaving(false); }
  }

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl mx-auto pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Novo Pedido de Venda
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Preencha os dados abaixo</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">

        {/* ── 1. Cliente + Vendedor ── */}
        <Section icon={User} title="Cliente">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label required>Cliente</Label>
              <Autocomplete<Cliente>
                placeholder="Digite para buscar cliente..."
                onSearch={async q => { const r = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(q)}`); return r.json(); }}
                renderItem={c => (
                  <div>
                    <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{c.nome}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>{c.cpf_cnpj ?? c.telefone ?? "—"}</p>
                  </div>
                )}
                onSelect={setCliente}
                selectedLabel={cliente ? `${cliente.nome}${cliente.cpf_cnpj ? ` · ${cliente.cpf_cnpj}` : ""}` : null}
                onClear={() => setCliente(null)}
              />
              {cliente && (
                <>
                  <p className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>
                    {[cliente.email, cliente.telefone].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setShowDadosCliente(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <FileText size={12} /> Dados
                    </button>
                    <button type="button" onClick={() => setShowNovoCliente(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <UserPlus size={12} /> Novo Cliente
                    </button>
                    <button type="button" onClick={() => setShowEndEntrega(!showEndEntrega)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: showEndEntrega ? C.esmeralda : C.cremeBorder, color: C.esmeralda, backgroundColor: showEndEntrega ? C.esmeraldaLt : "transparent" }}>
                      <MapPin size={12} /> End. Entrega
                    </button>
                  </div>
                </>
              )}
              {!cliente && (
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setShowNovoCliente(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                    <UserPlus size={12} /> Novo Cliente
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label required>Vendedor</Label>
              {isFullAccess ? (
                <Select value={vendedorSel} onChange={e => setVendedorSel(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Selecione um vendedor</option>
                  {vendedores.map(v => <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>)}
                </Select>
              ) : (
                <div className="border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: C.cremeBg }}>
                  {vendedores.find(v => v.id_vendedor === vendedorId)?.nome ?? "—"}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ── Endereço de Entrega (expandível) ── */}
        {showEndEntrega && (
          <Secao>
            <div className="flex items-center justify-between mb-4">
              <STitle>Endereço de Entrega</STitle>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#374151" }}>
                <input type="checkbox" checked={mesmoEndereco} onChange={e => setMesmoEndereco(e.target.checked)} className="rounded border-gray-300" />
                Mesmo do cliente
              </label>
            </div>
            {mesmoEndereco && cliente ? (
              <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                {[cliente.endereco, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.uf, cliente.cep].filter(Boolean).join(", ") || "Endereço não cadastrado no cliente"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div><Label required>CEP</Label><Input value={endEntrega.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setEndEntrega(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "entrega"); }} /></div>
                <div className="md:col-span-2"><Label required>Logradouro</Label><Input value={endEntrega.logradouro} onChange={e => setEndEntrega(p => ({ ...p, logradouro: e.target.value }))} /></div>
                <div><Label required>Número</Label><Input value={endEntrega.numero} onChange={e => setEndEntrega(p => ({ ...p, numero: e.target.value }))} /></div>
                <div><Label>Complemento</Label><Input value={endEntrega.complemento} onChange={e => setEndEntrega(p => ({ ...p, complemento: e.target.value }))} /></div>
                <div><Label required>Bairro</Label><Input value={endEntrega.bairro} onChange={e => setEndEntrega(p => ({ ...p, bairro: e.target.value }))} /></div>
                <div><Label required>Cidade</Label><Input value={endEntrega.cidade} onChange={e => setEndEntrega(p => ({ ...p, cidade: e.target.value }))} /></div>
                <div><Label required>UF</Label><Input value={endEntrega.uf} maxLength={2} onChange={e => setEndEntrega(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
              </div>
            )}
          </Secao>
        )}

        {/* ── Modal: Dados do Cliente ── */}
        {showDadosCliente && cliente && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowDadosCliente(false); setEditingCliente(false); }}>
            <div className="bg-white rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
                <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>{editingCliente ? "Editar Cliente" : "Dados do Cliente"}</h3>
                <button onClick={() => { setShowDadosCliente(false); setEditingCliente(false); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                {editingCliente ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label required>Nome</Label><Input value={editClienteForm.nome} onChange={e => setEditClienteForm(p => ({ ...p, nome: e.target.value }))} /></div>
                      <div><Label>CPF/CNPJ</Label><Input value={editClienteForm.cpf_cnpj} onChange={e => setEditClienteForm(p => ({ ...p, cpf_cnpj: e.target.value }))} /></div>
                      <div><Label>Email</Label><Input type="email" value={editClienteForm.email} onChange={e => setEditClienteForm(p => ({ ...p, email: e.target.value }))} /></div>
                      <div><Label>Telefone</Label><Input value={editClienteForm.telefone} onChange={e => setEditClienteForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                      <div><Label>Celular</Label><Input value={editClienteForm.celular} onChange={e => setEditClienteForm(p => ({ ...p, celular: e.target.value }))} /></div>
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço de Cobrança</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div><Label>CEP</Label><Input value={editClienteForm.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setEditClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }} /></div>
                        <div className="md:col-span-2"><Label>Logradouro</Label><Input value={editClienteForm.endereco} onChange={e => setEditClienteForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                        <div><Label>Número</Label><Input value={editClienteForm.numero} onChange={e => setEditClienteForm(p => ({ ...p, numero: e.target.value }))} /></div>
                        <div><Label>Complemento</Label><Input value={editClienteForm.complemento} onChange={e => setEditClienteForm(p => ({ ...p, complemento: e.target.value }))} /></div>
                        <div><Label>Bairro</Label><Input value={editClienteForm.bairro} onChange={e => setEditClienteForm(p => ({ ...p, bairro: e.target.value }))} /></div>
                        <div><Label>Cidade</Label><Input value={editClienteForm.municipio} onChange={e => setEditClienteForm(p => ({ ...p, municipio: e.target.value }))} /></div>
                        <div><Label>UF</Label><Input value={editClienteForm.uf} maxLength={2} onChange={e => setEditClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                      </div>
                    </div>
                    {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
                  </>
                ) : (
                  <div className="text-sm space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Nome</span><p style={{ color: "#1A1A1A" }}>{cliente.nome}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>CPF/CNPJ</span><p style={{ color: "#1A1A1A" }}>{cliente.cpf_cnpj || "—"}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Email</span><p style={{ color: "#1A1A1A" }}>{cliente.email || "—"}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Telefone</span><p style={{ color: "#1A1A1A" }}>{cliente.telefone || "—"}</p></div>
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço de Cobrança</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Logradouro</span><p style={{ color: "#1A1A1A" }}>{cliente.endereco || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Número</span><p style={{ color: "#1A1A1A" }}>{cliente.numero || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Bairro</span><p style={{ color: "#1A1A1A" }}>{cliente.bairro || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Cidade</span><p style={{ color: "#1A1A1A" }}>{cliente.municipio || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>CEP</span><p style={{ color: "#1A1A1A" }}>{cliente.cep || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>UF</span><p style={{ color: "#1A1A1A" }}>{cliente.uf || "—"}</p></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.cremeBorder }}>
                {editingCliente ? (
                  <>
                    <button onClick={() => setEditingCliente(false)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                    <button onClick={handleSalvarCliente} disabled={savingCliente} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      {savingCliente ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Salvar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={startEditCliente} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button onClick={() => setShowDadosCliente(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: C.esmeralda, color: C.creme }}>Fechar</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Novo Cliente ── */}
        {showNovoCliente && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNovoCliente(false)}>
            <div className="bg-white rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
                <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Novo Cliente</h3>
                <button onClick={() => setShowNovoCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label required>Nome</Label><Input value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({ ...p, nome: e.target.value }))} /></div>
                  <div><Label>CPF/CNPJ</Label><Input value={novoClienteForm.cpf_cnpj} onChange={e => setNovoClienteForm(p => ({ ...p, cpf_cnpj: e.target.value }))} /></div>
                  <div><Label>Email</Label><Input type="email" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                  <div><Label>Celular</Label><Input value={novoClienteForm.celular} onChange={e => setNovoClienteForm(p => ({ ...p, celular: e.target.value }))} /></div>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div><Label>CEP</Label><Input value={novoClienteForm.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }} /></div>
                    <div className="md:col-span-2"><Label>Logradouro</Label><Input value={novoClienteForm.endereco} onChange={e => setNovoClienteForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                    <div><Label>Número</Label><Input value={novoClienteForm.numero} onChange={e => setNovoClienteForm(p => ({ ...p, numero: e.target.value }))} /></div>
                    <div><Label>Complemento</Label><Input value={novoClienteForm.complemento} onChange={e => setNovoClienteForm(p => ({ ...p, complemento: e.target.value }))} /></div>
                    <div><Label>Bairro</Label><Input value={novoClienteForm.bairro} onChange={e => setNovoClienteForm(p => ({ ...p, bairro: e.target.value }))} /></div>
                    <div><Label>Cidade</Label><Input value={novoClienteForm.municipio} onChange={e => setNovoClienteForm(p => ({ ...p, municipio: e.target.value }))} /></div>
                    <div><Label>UF</Label><Input value={novoClienteForm.uf} maxLength={2} onChange={e => setNovoClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                  </div>
                </div>
                {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
              </div>
              <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.cremeBorder }}>
                <button onClick={() => setShowNovoCliente(false)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                <button onClick={handleCriarCliente} disabled={savingCliente} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  {savingCliente ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Detalhes da Venda ── */}
        <Section icon={Truck} title="Envio">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label required>Data da Venda</Label>
              <Input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} />
            </div>
            <div>
              <Label>Data de Entrega</Label>
              <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
            </div>
            <div>
              <Label>Frete (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#9CA3AF" }}>R$</span>
                <input type="number" min={0} step={0.01} value={totalFrete || ""}
                  onChange={e => setTotalFrete(Number(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }} />
              </div>
            </div>
          </div>
        </Section>

        {/* ── 3. Produtos / Comissões ── */}
        <Section icon={Package} title={`Produtos (${itens.length})`}>
          <div className="space-y-2">
            {itens.length === 0 && !addingItem && (
              <p className="text-sm text-center py-3" style={{ color: "#9CA3AF" }}>Nenhum produto</p>
            )}

            {/* Item cards — mesmo layout da tela de detalhe */}
            {itens.map(item => (
              <div key={item._key} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: C.cremeBorder }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{item.nome_produto}</p>
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>
                    {item.sku && `${item.sku} · `}
                    {item.quantidade}× {fmt(item.preco_lista)}
                    {item.pct_desconto > 0 && ` −${item.pct_desconto}%`}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs font-semibold tabular-nums" style={{ color: C.esmeralda }}>
                      {fmt(item.total_item)}
                    </span>
                    {item.pct_comissao > 0 && (
                      <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                        Comissão: {item.pct_comissao}% = {fmt(item.valor_comissao)}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0" style={{ color: "#EF4444" }}>
                  <X size={13} />
                </button>
              </div>
            ))}

            {/* Painel adicionar item */}
            {addingItem && (
              <div className="p-3 rounded-lg border space-y-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Adicionar produto</p>
                  <button onClick={() => { setAddingItem(false); setProdutoSel(null); setDescontoErr(""); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
                <Autocomplete<Produto>
                  placeholder="Buscar por nome ou SKU..."
                  onSearch={async q => { const r = await fetch(`/api/vendas/produtos/busca?q=${encodeURIComponent(q)}&limit=15`); return r.json(); }}
                  renderItem={p => (
                    <div>
                      <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{p.nome}</p>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>{p.sku} · {p.preco_venda != null ? fmt(p.preco_venda) : "sem preço"}</p>
                    </div>
                  )}
                  onSelect={p => { setProdutoSel(p); setPctDesconto(0); setDescontoErr(""); }}
                  selectedLabel={produtoSel ? `${produtoSel.nome} · ${fmt(produtoSel.preco_venda ?? 0)}` : null}
                  onClear={() => { setProdutoSel(null); setDescontoErr(""); }}
                />
                {produtoSel && (
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#6B7280" }}>Qtd</label>
                      <input type="number" min={1} value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center" style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#6B7280" }}>% Desc (máx {maxDesconto}%)</label>
                      <input type="number" min={0} max={maxDesconto} step={1} value={pctDesconto}
                        onChange={e => { const v = Number(e.target.value); setPctDesconto(v); setDescontoErr(v > maxDesconto ? `Máx: ${maxDesconto}%` : ""); }}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                        style={{ borderColor: descontoErr ? "#EF4444" : C.cremeBorder }} />
                      {descontoErr && <p className="text-[10px] text-red-500 mt-0.5">{descontoErr}</p>}
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#6B7280" }}>Preço un</label>
                      <div className="border rounded-lg px-2 py-1.5 text-sm text-center tabular-nums" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: C.esmeralda }}>
                        {fmt(calcItem(produtoSel, qtd, pctDesconto).preco_unitario)}
                      </div>
                    </div>
                    <button onClick={handleAddItem} disabled={!!descontoErr || pctDesconto > maxDesconto}
                      className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40"
                      style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      <Plus size={14} /> Confirmar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Botão adicionar */}
            {!addingItem && (
              <button onClick={() => setAddingItem(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed text-xs font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                <Plus size={13} /> Adicionar produto
              </button>
            )}

            {/* Totais */}
            {itens.length > 0 && (
              <div className="pt-2 space-y-1 border-t" style={{ borderColor: C.cremeBorder }}>
                {[
                  { label: "Produtos",  value: totalProdutos, show: true },
                  { label: "Desconto",  value: -totalDesconto, show: totalDesconto > 0 },
                  { label: "Frete",     value: totalFrete,     show: totalFrete > 0 },
                  { label: "Total",     value: totalVenda,     show: true, bold: true },
                ].filter(r => r.show).map(r => (
                  <div key={r.label} className={`flex items-center justify-between text-sm ${r.bold ? "font-semibold" : ""}`}>
                    <span style={{ color: r.bold ? C.esmeralda : "#6B7280" }}>{r.label}</span>
                    <span className="tabular-nums" style={{ color: r.bold ? C.esmeralda : "#374151" }}>{fmt(r.value ?? 0)}</span>
                  </div>
                ))}
                {totalComissao > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
                    <span>Comissão total</span>
                    <span className="tabular-nums">{fmt(totalComissao)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* ── 4. Pagamento ── */}
        <Section icon={CreditCard} title="Pagamento">
          <p className="text-sm mb-4" style={{ color: "#6B7280" }}>Selecione a forma de recebimento do valor total</p>

          {itens.length === 0 ? (
            <div className="rounded-lg border px-4 py-6 text-sm text-center" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
              Adicione produtos para configurar o pagamento
            </div>
          ) : (<>

          {/* Forma de recebimento */}
          <div className="mb-4">
            <Label>Forma de recebimento</Label>
            <Select value={pagForma} onChange={e => { setPagForma(e.target.value); setPagCondicao("À vista"); }} className="w-56">
              <optgroup label="Métodos de Pagamento">
                {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
              </optgroup>
            </Select>
          </div>

          {/* Dinheiro */}
          {pagForma === "Dinheiro" && (
            <div className="rounded-lg border px-4 py-3 text-sm mb-4" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
              Pagamento em dinheiro. Não há campos adicionais necessários.
            </div>
          )}

          {/* Cartão Crédito / Débito — gateway + bandeira */}
          {COM_CARTAO.includes(pagForma) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Gateway</Label>
                <Select value={pagGateway} onChange={e => setPagGateway(e.target.value)}>
                  {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
              </div>
              <div>
                <Label>Bandeira</Label>
                <Select value={pagBandeira} onChange={e => setPagBandeira(e.target.value)}>
                  {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
                </Select>
              </div>
              {pagForma === "Cartão de Crédito" && (
                <div>
                  <Label>Condição de Pagamento</Label>
                  <Select value={pagCondicao} onChange={e => setPagCondicao(e.target.value)}>
                    {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Ouro / A Receber / Pix / Vale-Troca — só condição */}
          {COM_PARCELAS.includes(pagForma) && !COM_CARTAO.includes(pagForma) && pagForma !== "Dinheiro" && (
            <div className="mb-4 w-56">
              <Label>Condição de Pagamento</Label>
              <Select value={pagCondicao} onChange={e => setPagCondicao(e.target.value)}>
                {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          )}

          {/* Tabela de parcelas */}
          {COM_PARCELAS.includes(pagForma) && parcelasRows.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#374151" }}>Detalhamento das parcelas</p>
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>Configure o valor e data de cada parcela. Valores editados não serão redistribuídos automaticamente.</p>
                </div>
                <button onClick={equalizarParcelas}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                  ↺ Equalizar
                </button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Nº", "Dias", "Data", "Valor"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasRows.map((row, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-3 py-2.5 text-xs w-8" style={{ color: "#9CA3AF" }}>{row.num}</td>
                        <td className="px-3 py-2.5 w-24">
                          <input type="number" value={row.dias} min={0}
                            onChange={e => updateParcelaRow(i, "dias", e.target.value)}
                            className="w-16 border rounded px-2 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                        </td>
                        <td className="px-3 py-2.5 w-40">
                          <input type="date" value={row.data}
                            onChange={e => updateParcelaRow(i, "data", e.target.value)}
                            className="border rounded px-2 py-1 text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={row.valor.toFixed(2).replace(".", ",")}
                            onChange={e => updateParcelaRow(i, "valor", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm outline-none text-right tabular-nums" style={{ borderColor: C.cremeBorder }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Totais */}
                <div className="grid grid-cols-2 border-t px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>Total da venda</p>
                    <p className="font-bold tabular-nums" style={{ color: "#374151" }}>{fmt(totalVenda)}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>Total das parcelas</p>
                    {(() => {
                      const soma = parcelasRows.reduce((s, r) => s + r.valor, 0);
                      const ok = Math.abs(soma - totalVenda) < 0.02;
                      return <p className="font-bold tabular-nums" style={{ color: ok ? "#059669" : "#D97706" }}>{fmt(soma)}</p>;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Múltiplas */}
          {pagForma === "Múltiplas" && (() => {
            const totalMult = pagamentos.reduce((s, p) => s + p.valor, 0);
            const restante  = +(totalVenda - totalMult).toFixed(2);
            return (
              <div className="mb-4">
                <div className="flex flex-wrap items-end gap-2 mb-3">
                  <div className="flex-1 min-w-36">
                    <Label>Forma</Label>
                    <Select value={pagMultForma} onChange={e => setPagMultForma(e.target.value)}>
                      <optgroup label="Métodos de Pagamento">
                        {FORMAS_PAGAMENTO.filter(f => f !== "Múltiplas").map(f => <option key={f} value={f}>{f}</option>)}
                      </optgroup>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-28">
                    <Label>Valor{restante > 0 && <span className="ml-1 font-normal text-xs" style={{ color: "#9CA3AF" }}>(restante: {fmt(restante)})</span>}</Label>
                    <input type="text" value={pagValor} onChange={e => setPagValor(e.target.value)}
                      placeholder={restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00"}
                      onKeyDown={e => e.key === "Enter" && handleAddPagamento()}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                  </div>
                  <button onClick={handleAddPagamento} disabled={restante <= 0}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    <Plus size={13} /> Adicionar
                  </button>
                </div>
                {pagamentos.length > 0 && (
                  <div className="space-y-1.5">
                    {pagamentos.map(p => (
                      <div key={p._key} className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }}>
                        <span style={{ color: "#374151" }}>{p.forma}</span>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(p.valor)}</span>
                          <button onClick={() => setPagamentos(prev => prev.filter(x => x._key !== p._key))} className="text-gray-300 hover:text-red-400"><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
                      <span style={{ color: "#6B7280" }}>Restante a pagar</span>
                      <span className="tabular-nums font-semibold" style={{ color: restante > 0.01 ? "#D97706" : "#059669" }}>{fmt(restante)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Categoria */}
          <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder }}>
            <span className="font-medium" style={{ color: "#374151" }}>Categoria:</span>
            <span className="ml-1" style={{ color: "#6B7280" }}>01.01 - Vendas de Produtos e serviço</span>
          </div>

          {/* Resumo totais */}
          <div className="mt-4 pt-4 border-t space-y-1.5" style={{ borderColor: C.cremeBorder }}>
            {totalDesconto > 0 && (
              <div className="flex justify-between text-sm"><span style={{ color: "#6B7280" }}>Desconto</span><span className="tabular-nums" style={{ color: "#D97706" }}>−{fmt(totalDesconto)}</span></div>
            )}
            {totalFrete > 0 && (
              <div className="flex justify-between text-sm"><span style={{ color: "#6B7280" }}>Frete</span><span className="tabular-nums" style={{ color: "#374151" }}>{fmt(totalFrete)}</span></div>
            )}
            <div className="flex justify-between text-base font-bold pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
              <span style={{ color: C.esmeralda }}>Total</span>
              <span className="tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalVenda)}</span>
            </div>
          </div>

          </>)}
        </Section>

        {/* ── 5. Transportador e Frete ── */}
        <Section icon={Truck} title="Transportador">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Forma de Envio</Label>
              <Select value={formaEnvioId} onChange={e => { setFormaEnvioId(e.target.value === "" ? "" : Number(e.target.value)); setFormaFreteId(""); }}>
                <option value="">Selecione a forma de envio</option>
                {formaEnvioOpts.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
            </div>
            <div>
              <Label>Forma de Frete</Label>
              <Select value={formaFreteId} disabled={!formaEnvioId || formaFreteOpts.length === 0}
                onChange={e => setFormaFreteId(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ borderColor: C.cremeBorder, color: "#374151", opacity: (!formaEnvioId || formaFreteOpts.length === 0) ? 0.5 : 1 }}>
                <option value="">Selecione a forma de frete</option>
                {formaFreteOpts.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
              {formaEnvioId && formaFreteOpts.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Sem fretes cadastrados para este envio</p>
              )}
            </div>
          </div>
        </Section>

        {/* ── 6. Dados Adicionais ── */}
        <Section icon={FileText} title="Observações">
          <div className="space-y-4">
            <div>
              <Label>Observações</Label>
              <textarea rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)}
                placeholder="Digite observações sobre o pedido..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            <div>
              <Label>Observações Internas</Label>
              <textarea rows={3} value={obsInternas} onChange={e => setObsInternas(e.target.value)}
                placeholder="Digite observações internas (uso interno)..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            {isFullAccess && (
              <div>
                <Label>Vídeo Interno</Label>
                {!videoPreviewUrl ? (
                  <label className="flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed cursor-pointer py-6 transition-colors hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                    <Video size={22} style={{ color: "#9CA3AF" }} />
                    <span className="text-sm" style={{ color: "#9CA3AF" }}>Gravar ou selecionar vídeo</span>
                    <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoSelect} />
                  </label>
                ) : (
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    <video src={videoPreviewUrl} controls className="w-full max-h-48 bg-black" />
                    <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: C.cremeBg }}>
                      {uploadingVideo ? (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6B7280" }}><Loader2 size={12} className="animate-spin" /> Enviando…</span>
                      ) : videoUploadErr ? (
                        <span className="text-xs text-red-500">{videoUploadErr}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs" style={{ color: C.esmeralda }}><CheckCircle size={12} /> Enviado</span>
                      )}
                      <button type="button" onClick={handleRemoveVideo} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400"><X size={12} /> Remover</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

      </div>

      {/* ── Footer fixo (mesmo padrão da tela de detalhe) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 border-t"
        style={{ backgroundColor: "#fff", borderColor: C.cremeBorder }}
      >
        {saveErr && <p className="text-xs text-red-600 text-center mb-2">{saveErr}</p>}
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Link href="/vendas"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
            style={{ borderColor: "#FCA5A5", color: "#EF4444" }}>
            <XCircle size={14} /> Cancelar
          </Link>
          <button onClick={() => submit("rascunho")} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-40"
            style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Salvar Rascunho
          </button>
          <button onClick={() => submit("aprovado")} disabled={saving || itens.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Concluir Venda
          </button>
        </div>
      </div>
    </div>
  );
}
