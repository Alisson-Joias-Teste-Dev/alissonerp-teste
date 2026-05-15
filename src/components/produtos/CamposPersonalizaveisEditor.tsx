"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Check } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

export type CampoTipo = "texto" | "numero" | "selecao_unica" | "selecao_multipla";

export interface OpcaoEditor {
  id?: number;
  valor: string;
  preco_extra: string;   // string pra controlar input
  peso_extra: string;
}

export interface CampoEditor {
  id?: number;
  nome: string;
  tipo: CampoTipo;
  obrigatorio: boolean;
  // texto
  min_caracteres: string;
  max_caracteres: string;
  caracteres_permitidos: string;
  preco_por_letra: string;
  peso_por_letra: string;
  // numero
  min_valor: string;
  max_valor: string;
  // genérico (extra fixo se preenchido)
  preco_extra: string;
  peso_extra: string;
  // selecao
  opcoes: OpcaoEditor[];
}

const TIPOS: { value: CampoTipo; label: string; hint: string }[] = [
  { value: "texto",            label: "Texto",            hint: "Gravação, mensagem, nome…" },
  { value: "numero",           label: "Número",           hint: "Tamanho do aro, quantidade…" },
  { value: "selecao_unica",    label: "Seleção única",    hint: "Cliente escolhe 1 opção" },
  { value: "selecao_multipla", label: "Múltipla seleção", hint: "Cliente marca várias" },
];

const CARACTERES_OPCOES = [
  { value: "alfa",                  label: "Letras A-Z" },
  { value: "alfa_acento",           label: "Letras A-Z + acentos" },
  { value: "alfa_acento_espaco",    label: "Letras + acentos + espaços" },
  { value: "alfanum",               label: "Letras + números" },
  { value: "alfanum_acento_espaco", label: "Letras + números + acentos + espaços" },
  { value: "numero",                label: "Só números" },
  { value: "qualquer",              label: "Qualquer caractere" },
];

function novoCampo(): CampoEditor {
  return {
    nome: "",
    tipo: "texto",
    obrigatorio: true,
    min_caracteres: "1",
    max_caracteres: "20",
    caracteres_permitidos: "qualquer",
    preco_por_letra: "",
    peso_por_letra: "",
    min_valor: "",
    max_valor: "",
    preco_extra: "",
    peso_extra: "",
    opcoes: [],
  };
}

interface Props {
  /** ID do produto. Quando null, modo "novo produto" — o componente só
   *  edita um array em memória; pai chama `getCampos()` antes de salvar. */
  produtoId: number | null;
  /** Sinal pra recarregar do backend (incrementar pra recarregar). */
  reloadKey?: number;
  /** Callback chamado a cada mudança — útil pra modo "novo produto" */
  onChange?: (campos: CampoEditor[]) => void;
}

export default function CamposPersonalizaveisEditor({ produtoId, reloadKey, onChange }: Props) {
  const [campos, setCampos] = useState<CampoEditor[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (produtoId == null) return;
    setLoading(true); setErro(null);
    try {
      const r = await fetch(`/api/produtos/${produtoId}/personalizacao-campos`);
      if (!r.ok) {
        setErro(`Erro ${r.status} ao carregar campos`);
        return;
      }
      const d = await r.json() as { campos: Array<{
        id: number; nome: string; tipo: CampoTipo; obrigatorio: boolean;
        min_caracteres: number | null; max_caracteres: number | null;
        caracteres_permitidos: string | null;
        min_valor: number | null; max_valor: number | null;
        preco_extra: number | null; peso_extra: number | null;
        preco_por_letra: number | null; peso_por_letra: number | null;
        opcoes: Array<{ id: number; valor: string; preco_extra: number | null; peso_extra: number | null }>;
      }> };
      setCampos((d.campos ?? []).map((c) => ({
        id: c.id,
        nome: c.nome ?? "",
        tipo: (c.tipo ?? "texto") as CampoTipo,
        obrigatorio: !!c.obrigatorio,
        min_caracteres: c.min_caracteres != null ? String(c.min_caracteres) : "",
        max_caracteres: c.max_caracteres != null ? String(c.max_caracteres) : "",
        caracteres_permitidos: c.caracteres_permitidos ?? "qualquer",
        preco_por_letra: c.preco_por_letra != null ? String(c.preco_por_letra) : "",
        peso_por_letra: c.peso_por_letra != null ? String(c.peso_por_letra) : "",
        min_valor: c.min_valor != null ? String(c.min_valor) : "",
        max_valor: c.max_valor != null ? String(c.max_valor) : "",
        preco_extra: c.preco_extra != null ? String(c.preco_extra) : "",
        peso_extra: c.peso_extra != null ? String(c.peso_extra) : "",
        opcoes: (c.opcoes ?? []).map((o) => ({
          id: o.id,
          valor: o.valor,
          preco_extra: o.preco_extra != null ? String(o.preco_extra) : "",
          peso_extra: o.peso_extra != null ? String(o.peso_extra) : "",
        })),
      })));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setLoading(false);
    }
  }, [produtoId]);

  useEffect(() => { carregar(); }, [carregar, reloadKey]);

  // Notifica pai a cada mudança
  useEffect(() => { onChange?.(campos); }, [campos, onChange]);

  function atualizar(idx: number, patch: Partial<CampoEditor>) {
    setCampos((arr) => arr.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function remover(idx: number) {
    setCampos((arr) => arr.filter((_, i) => i !== idx));
  }
  function mover(idx: number, dir: -1 | 1) {
    setCampos((arr) => {
      const novo = [...arr];
      const j = idx + dir;
      if (j < 0 || j >= novo.length) return arr;
      [novo[idx], novo[j]] = [novo[j], novo[idx]];
      return novo;
    });
  }
  function adicionar() {
    setCampos((arr) => [...arr, novoCampo()]);
  }
  function adicionarOpcao(idx: number) {
    setCampos((arr) => arr.map((c, i) => i === idx
      ? { ...c, opcoes: [...c.opcoes, { valor: "", preco_extra: "", peso_extra: "" }] }
      : c));
  }
  function atualizarOpcao(cIdx: number, oIdx: number, patch: Partial<OpcaoEditor>) {
    setCampos((arr) => arr.map((c, i) => i === cIdx
      ? { ...c, opcoes: c.opcoes.map((o, j) => j === oIdx ? { ...o, ...patch } : o) }
      : c));
  }
  function removerOpcao(cIdx: number, oIdx: number) {
    setCampos((arr) => arr.map((c, i) => i === cIdx
      ? { ...c, opcoes: c.opcoes.filter((_, j) => j !== oIdx) }
      : c));
  }

  async function salvar() {
    if (produtoId == null) return; // modo "novo produto" — pai salva
    setSalvando(true); setErro(null); setOkMsg(null);
    try {
      // Serializa: só envia número quando o input não está vazio
      const payload = {
        campos: campos.map((c) => ({
          id: c.id ?? null,
          nome: c.nome.trim(),
          tipo: c.tipo,
          obrigatorio: c.obrigatorio,
          min_caracteres: c.min_caracteres ? Number(c.min_caracteres) : null,
          max_caracteres: c.max_caracteres ? Number(c.max_caracteres) : null,
          caracteres_permitidos: c.tipo === "texto" ? c.caracteres_permitidos : null,
          min_valor: c.min_valor ? Number(c.min_valor) : null,
          max_valor: c.max_valor ? Number(c.max_valor) : null,
          preco_extra: c.preco_extra ? Number(c.preco_extra) : null,
          peso_extra: c.peso_extra ? Number(c.peso_extra) : null,
          preco_por_letra: c.preco_por_letra ? Number(c.preco_por_letra) : null,
          peso_por_letra: c.peso_por_letra ? Number(c.peso_por_letra) : null,
          opcoes: c.opcoes.map((o) => ({
            valor: o.valor.trim(),
            preco_extra: o.preco_extra ? Number(o.preco_extra) : null,
            peso_extra:  o.peso_extra  ? Number(o.peso_extra)  : null,
          })),
        })),
      };
      const r = await fetch(`/api/produtos/${produtoId}/personalizacao-campos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      setOkMsg("Campos salvos.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: "#6B7280" }}>
          Cadastre os campos que o cliente preencherá. Ex: gravação, cor da pedra, tamanho.
          Cada campo aparece no fluxo de venda.
        </p>
        <button
          type="button"
          onClick={adicionar}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Plus size={12} strokeWidth={2.5} /> Adicionar campo
        </button>
      </div>

      {loading && <p className="text-[12px]" style={{ color: "#9CA3AF" }}><Loader2 size={11} className="inline animate-spin mr-1" /> Carregando…</p>}
      {erro && <p className="text-[12px] text-red-600">⚠ {erro}</p>}
      {okMsg && <p className="text-[12px] text-green-700">✓ {okMsg}</p>}

      {campos.length === 0 && !loading && (
        <p className="text-[12px] text-center py-6 rounded-lg border border-dashed" style={{ color: "#9CA3AF", borderColor: C.cremeBorder }}>
          Nenhum campo. Clique em <strong>+ Adicionar campo</strong>.
        </p>
      )}

      <div className="space-y-2">
        {campos.map((c, idx) => (
          <CampoCard
            key={c.id ?? `novo-${idx}`}
            campo={c}
            idx={idx}
            total={campos.length}
            onChange={(patch) => atualizar(idx, patch)}
            onRemove={() => remover(idx)}
            onMover={(d) => mover(idx, d)}
            onAddOpcao={() => adicionarOpcao(idx)}
            onChangeOpcao={(o, p) => atualizarOpcao(idx, o, p)}
            onRemoveOpcao={(o) => removerOpcao(idx, o)}
          />
        ))}
      </div>

      {/* Salvar — só aparece quando produtoId definido (produto existente) */}
      {produtoId != null && campos.length > 0 && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Salvar campos
          </button>
        </div>
      )}
    </div>
  );
}

function CampoCard({
  campo, idx, total, onChange, onRemove, onMover,
  onAddOpcao, onChangeOpcao, onRemoveOpcao,
}: {
  campo: CampoEditor;
  idx: number;
  total: number;
  onChange: (patch: Partial<CampoEditor>) => void;
  onRemove: () => void;
  onMover: (dir: -1 | 1) => void;
  onAddOpcao: () => void;
  onChangeOpcao: (oIdx: number, patch: Partial<OpcaoEditor>) => void;
  onRemoveOpcao: (oIdx: number) => void;
}) {
  const ehSelecao = campo.tipo === "selecao_unica" || campo.tipo === "selecao_multipla";
  return (
    <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
          {idx + 1}
        </span>
        <input
          type="text"
          value={campo.nome}
          onChange={(e) => onChange({ nome: e.target.value })}
          placeholder="Nome do campo (ex: Gravação, Cor da pedra)"
          maxLength={120}
          className="flex-1 px-2.5 py-1.5 rounded-md border text-sm bg-white outline-none"
          style={{ borderColor: C.cremeBorder, color: "#111827" }}
        />
        <button type="button" onClick={() => onMover(-1)} disabled={idx === 0} className="p-1 rounded hover:bg-white disabled:opacity-30" title="Subir">
          <ChevronUp size={13} />
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={idx === total - 1} className="p-1 rounded hover:bg-white disabled:opacity-30" title="Descer">
          <ChevronDown size={13} />
        </button>
        <button type="button" onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-red-500" title="Remover">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Linha 2: tipo + obrigatório */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider mr-1" style={{ color: "#6B7280" }}>Tipo</label>
          <select
            value={campo.tipo}
            onChange={(e) => onChange({ tipo: e.target.value as CampoTipo })}
            className="px-2 py-1 rounded border text-[12px] bg-white outline-none"
            style={{ borderColor: C.cremeBorder }}
          >
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <span className="ml-1 text-[10px]" style={{ color: "#9CA3AF" }}>{TIPOS.find((t) => t.value === campo.tipo)?.hint}</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer text-[12px]">
          <input
            type="checkbox"
            checked={campo.obrigatorio}
            onChange={(e) => onChange({ obrigatorio: e.target.checked })}
            className="w-3.5 h-3.5 accent-[#184036]"
          />
          Obrigatório
        </label>
      </div>

      {/* Validações por tipo */}
      {campo.tipo === "texto" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Mín caracteres</label>
            <input type="number" min="0" value={campo.min_caracteres} onChange={(e) => onChange({ min_caracteres: e.target.value })} className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Máx caracteres</label>
            <input type="number" min="0" value={campo.max_caracteres} onChange={(e) => onChange({ max_caracteres: e.target.value })} className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Caracteres permitidos</label>
            <select value={campo.caracteres_permitidos} onChange={(e) => onChange({ caracteres_permitidos: e.target.value })} className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }}>
              {CARACTERES_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {campo.tipo === "numero" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Mín valor</label>
            <input type="number" step="0.01" value={campo.min_valor} onChange={(e) => onChange({ min_valor: e.target.value })} className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Máx valor</label>
            <input type="number" step="0.01" value={campo.max_valor} onChange={(e) => onChange({ max_valor: e.target.value })} className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
          </div>
        </div>
      )}

      {/* Preço/peso extra fixo (texto e numero) */}
      {(campo.tipo === "texto" || campo.tipo === "numero") && (
        <div className="grid grid-cols-2 gap-2">
          {campo.tipo === "texto" && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>R$ por letra</label>
                <input type="number" step="0.01" min="0" value={campo.preco_por_letra} onChange={(e) => onChange({ preco_por_letra: e.target.value })} placeholder="opcional" className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>g por letra</label>
                <input type="number" step="0.01" min="0" value={campo.peso_por_letra} onChange={(e) => onChange({ peso_por_letra: e.target.value })} placeholder="opcional" className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
              </div>
            </>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>R$ extra fixo</label>
            <input type="number" step="0.01" min="0" value={campo.preco_extra} onChange={(e) => onChange({ preco_extra: e.target.value })} placeholder="opcional" className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>g extra fixo</label>
            <input type="number" step="0.01" min="0" value={campo.peso_extra} onChange={(e) => onChange({ peso_extra: e.target.value })} placeholder="opcional" className="w-full px-2 py-1 rounded border text-[12px] bg-white" style={{ borderColor: C.cremeBorder }} />
          </div>
        </div>
      )}

      {/* Opções (selecao_unica/multipla) */}
      {ehSelecao && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Opções ({campo.opcoes.length})
            </span>
            <button type="button" onClick={onAddOpcao} className="text-[11px] font-semibold px-2 py-1 rounded border hover:bg-white" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
              + Adicionar opção
            </button>
          </div>
          {campo.opcoes.length === 0 && (
            <p className="text-[11px] py-2 text-center" style={{ color: "#9CA3AF" }}>
              Nenhuma opção. Adicione pelo menos uma.
            </p>
          )}
          {campo.opcoes.map((o, oIdx) => (
            <div key={o.id ?? `nova-${oIdx}`} className="grid grid-cols-[1fr_90px_90px_24px] gap-1 items-center">
              <input
                type="text"
                value={o.valor}
                onChange={(e) => onChangeOpcao(oIdx, { valor: e.target.value })}
                placeholder="Valor (ex: Azul)"
                maxLength={120}
                className="px-2 py-1 rounded border text-[12px] bg-white outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
              <input
                type="number"
                step="0.01"
                value={o.preco_extra}
                onChange={(e) => onChangeOpcao(oIdx, { preco_extra: e.target.value })}
                placeholder="R$ extra"
                className="px-2 py-1 rounded border text-[12px] bg-white outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
              <input
                type="number"
                step="0.01"
                value={o.peso_extra}
                onChange={(e) => onChangeOpcao(oIdx, { peso_extra: e.target.value })}
                placeholder="g extra"
                className="px-2 py-1 rounded border text-[12px] bg-white outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
              <button type="button" onClick={() => onRemoveOpcao(oIdx)} className="p-1 rounded hover:bg-red-50 text-red-500" title="Remover opção">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
