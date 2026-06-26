"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

type Campo =
  | "tipo_item"
  | "tipo_metal"
  | "categoria"
  | "situacao"
  | "tem_pedra_preciosa"
  | "peso_precificado"
  | "markup"
  | "fator"
  | "categoria_precificacao";

interface Props {
  open: boolean;
  ids: number[];
  onClose: () => void;
  onSaved: (atualizados: number) => void;
}

const CAMPO_LABELS: Record<Campo, string> = {
  tipo_item: "Tipo de item (joia / insumo)",
  tipo_metal: "Metal",
  categoria: "Categoria",
  situacao: "Situação",
  tem_pedra_preciosa: "Tem pedra preciosa",
  peso_precificado: "Peso precificado (g)",
  markup: "Markup",
  fator: "Fator",
  categoria_precificacao: "Categoria de precificação",
};

export default function BulkEditModal({ open, ids, onClose, onSaved }: Props) {
  const [campo, setCampo] = useState<Campo>("tipo_metal");
  const [valor, setValor] = useState<string>("");
  const [boolVal, setBoolVal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!open) return null;

  function resetForm() {
    setValor("");
    setBoolVal(false);
    setErro(null);
  }

  async function aplicar() {
    setErro(null);
    const updates: Record<string, unknown> = {};
    // Aceita formato brasileiro: "4.500" = 4500, "4.500,50" = 4500.50
    const parseNum = (v: string) => {
      let t = v.trim();
      if (t === "") return null;
      if (t.includes(",")) {
        t = t.replace(/\./g, "").replace(",", ".");
      } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
        t = t.replace(/\./g, "");
      }
      const n = parseFloat(t);
      return isNaN(n) ? NaN : n;
    };

    if (campo === "tipo_item") {
      if (valor === "") { updates.tipo_item = null; }
      else if (valor === "joia" || valor === "insumo") { updates.tipo_item = valor; }
      else { setErro("Selecione joia, insumo ou 'remover classificação'"); return; }
    } else if (campo === "tipo_metal" || campo === "categoria" || campo === "categoria_precificacao") {
      updates[campo] = valor.trim() ? valor.trim() : null;
    } else if (campo === "situacao") {
      if (valor !== "A" && valor !== "I") { setErro("Selecione Ativo ou Inativo"); return; }
      updates.situacao = valor;
    } else if (campo === "tem_pedra_preciosa") {
      updates.tem_pedra_preciosa = boolVal;
    } else {
      const n = parseNum(valor);
      if (Number.isNaN(n)) { setErro("Valor numérico inválido"); return; }
      updates[campo] = n;
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/produtos/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, updates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao aplicar edição");
        return;
      }
      onSaved(Number(data.atualizados ?? ids.length));
      resetForm();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSalvando(false);
    }
  }

  const renderInput = () => {
    if (campo === "tipo_item") {
      return (
        <select
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
        >
          <option value="joia">Joia</option>
          <option value="insumo">Insumo</option>
          <option value="">Remover classificação</option>
        </select>
      );
    }
    if (campo === "tipo_metal") {
      return (
        <>
          <input
            type="text"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="— Sem metal definido —"
            list="bulk-metal"
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
          />
          <datalist id="bulk-metal">
            <option value="Ouro 18k" />
            <option value="Ouro Amarelo 18k" />
            <option value="Ouro Branco 18k" />
            <option value="Ouro Rose 18k" />
            <option value="Prata" />
          </datalist>
        </>
      );
    }
    if (campo === "categoria" || campo === "categoria_precificacao") {
      return (
        <input
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="— vazio —"
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
        />
      );
    }
    if (campo === "situacao") {
      return (
        <select
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
        >
          <option value="">Selecione…</option>
          <option value="A">Ativo</option>
          <option value="I">Inativo</option>
        </select>
      );
    }
    if (campo === "tem_pedra_preciosa") {
      return (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={boolVal}
            onChange={(e) => setBoolVal(e.target.checked)}
            className="accent-[#184036]"
          />
          {boolVal ? "Com pedra preciosa" : "Sem pedra preciosa"}
        </label>
      );
    }
    return (
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="—"
        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-mono"
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-[440px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Edição em massa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Aplicar alteração em <strong>{ids.length}</strong> produto(s) selecionado(s).
          </p>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Campo a editar
            </label>
            <select
              value={campo}
              onChange={(e) => {
                const novo = e.target.value as Campo;
                setCampo(novo);
                resetForm();
                if (novo === "tipo_item") setValor("joia");
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
            >
              {Object.entries(CAMPO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Novo valor
            </label>
            {renderInput()}
          </div>

          {erro && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 border border-red-100">
              {erro}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={salvando}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={aplicar}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#184036" }}
          >
            {salvando && <Loader2 size={13} className="animate-spin" />}
            Aplicar em {ids.length} produto(s)
          </button>
        </div>
      </div>
    </div>
  );
}
