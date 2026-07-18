"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Save, Printer, Crosshair, Trash2, Plus, Ruler } from "lucide-react";
import { toast } from "sonner";

import { useImpressora } from "@/hooks/rfid/useImpressora";
import { enviarEVerificar, enviarECapturarAte } from "@/lib/rfid/browser-print";
import {
  gerarZplCalibracao,
  gerarZplEtiquetaJoia,
  type LayoutEtiqueta,
} from "@/lib/rfid/zpl";
import { interpretarRespostaCalibracao } from "@/lib/rfid/verificacao";
import { mmToDots, type EtiquetaModelo, type Epc } from "@/lib/rfid/tipos";

// EPC de teste (24 dígitos válidos) só para o "imprimir teste".
const EPC_TESTE = "100100000000000000000001" as Epc;
const COD_BARRAS_TESTE = "100234";

interface FormModelo {
  id?: number;
  nome: string;
  largura_mm: number;
  altura_mm: number;
  offset_x_mm: number;
  offset_y_mm: number;
  posicao_rfid: string;
  padrao: boolean;
}

const FORM_VAZIO: FormModelo = {
  nome: "",
  largura_mm: 25,
  altura_mm: 38,
  offset_x_mm: 0,
  offset_y_mm: 0,
  posicao_rfid: "F0",
  padrao: true,
};

function toForm(m: EtiquetaModelo): FormModelo {
  return {
    id: m.id,
    nome: m.nome,
    largura_mm: m.largura_mm,
    altura_mm: m.altura_mm,
    offset_x_mm: m.offset_x_mm,
    offset_y_mm: m.offset_y_mm,
    posicao_rfid: m.posicao_rfid ?? "F0",
    padrao: m.padrao,
  };
}

const inputCls =
  "w-full h-9 px-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
const btnBase =
  "inline-flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors disabled:opacity-50";

export function PainelLayoutEtiqueta() {
  const { device, status } = useImpressora();
  const conectada = status === "conectado" && !!device;

  const [modelos, setModelos] = useState<EtiquetaModelo[]>([]);
  const [form, setForm] = useState<FormModelo>(FORM_VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [calibrando, setCalibrando] = useState(false);
  const [calibrandoMidia, setCalibrandoMidia] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [tid, setTid] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/rfid/modelos");
      const d = await r.json();
      const lista: EtiquetaModelo[] = d.modelos ?? [];
      setModelos(lista);
      const padrao = lista.find((m) => m.padrao) ?? lista[0];
      if (padrao) setForm(toForm(padrao));
    } catch {
      toast.error("Falha ao carregar modelos");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const set = <K extends keyof FormModelo>(k: K, v: FormModelo[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const layoutAtual = (): LayoutEtiqueta => ({
    larguraDots: mmToDots(form.largura_mm),
    alturaDots: mmToDots(form.altura_mm),
    offsetXDots: mmToDots(form.offset_x_mm),
    offsetYDots: mmToDots(form.offset_y_mm),
    posicaoRfid: form.posicao_rfid || "F0",
  });

  // ── Calibrar mídia (comprimento/gap da etiqueta) ────────────────────────
  async function calibrarMidia() {
    if (!device) return;
    setCalibrandoMidia(true);
    try {
      // ~JC calibra a mídia (avança medindo); o getvar devolve o comprimento.
      const raw = await enviarEVerificar(
        device,
        '~JC\r\n! U1 getvar "zpl.label_length"\r\n',
        40_000,
      );
      const m = raw.match(/(\d+)/);
      if (m) {
        const mm = Math.round((parseInt(m[1], 10) / 8) * 10) / 10; // dots→mm (203dpi)
        if (mm > 0) set("altura_mm", mm);
        toast.success(`Mídia calibrada — etiqueta ~${mm} mm de altura`);
      } else {
        toast.success("Mídia calibrada.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao calibrar mídia");
    } finally {
      setCalibrandoMidia(false);
    }
  }

  // ── Calibrar chip (varredura ampla ^HR) ────────────────────────────────
  async function calibrar() {
    if (!device) return;
    setCalibrando(true);
    setTid(null);
    try {
      // ^HR manda "start", varre por minutos em silêncio e fecha com "end".
      const raw = await enviarECapturarAte(device, gerarZplCalibracao(), "end", 300_000);
      const res = interpretarRespostaCalibracao(raw);
      if (res.sucesso && res.posicao) {
        set("posicao_rfid", res.posicao);
        setTid(res.tidInfo);
        toast.success(
          `Chip calibrado — posição ${res.posicao}` +
            (res.tidInfo ? ` (${res.tidInfo})` : ""),
        );
      } else {
        toast.error(
          "Calibração não encontrou o chip. Verifique a mídia/posição e tente de novo.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na calibração");
    } finally {
      setCalibrando(false);
    }
  }

  // ── Imprimir teste (com o layout atual do formulário) ──────────────────
  async function imprimirTeste() {
    if (!device) return;
    setImprimindo(true);
    try {
      const zpl = gerarZplEtiquetaJoia(
        { id_produto: 0, sku: "TESTE", nome: "Etiqueta de teste" },
        EPC_TESTE,
        COD_BARRAS_TESTE,
        layoutAtual(),
      );
      await enviarEVerificar(device, zpl, 20_000);
      toast.success("Teste enviado — confira o alinhamento na etiqueta.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao imprimir teste");
    } finally {
      setImprimindo(false);
    }
  }

  // ── Salvar modelo ──────────────────────────────────────────────────────
  async function salvar() {
    if (!form.nome.trim()) {
      toast.error("Dê um nome ao modelo");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/rfid/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro ao salvar");
      toast.success("Modelo salvo");
      await carregar();
      setForm(toForm(d.modelo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!form.id) return;
    if (!confirm(`Excluir o modelo "${form.nome}"?`)) return;
    try {
      const r = await fetch(`/api/rfid/modelos/${form.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
      toast.success("Modelo excluído");
      setForm(FORM_VAZIO);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando modelos…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Seletor de modelos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">Modelo:</span>
        <select
          className={inputCls + " w-auto min-w-[200px]"}
          value={form.id ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            const m = modelos.find((x) => x.id === id);
            setForm(m ? toForm(m) : FORM_VAZIO);
          }}
        >
          <option value="">— novo modelo —</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} {m.padrao ? "★" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btnBase + " border border-gray-300 hover:bg-gray-50"}
          onClick={() => setForm(FORM_VAZIO)}
        >
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>

      {/* Formulário do modelo */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <label className="text-xs text-gray-500">Nome do modelo</label>
          <input
            className={inputCls}
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Ex.: Tag joia dobrável 25×22"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Campo label="Largura (mm)" value={form.largura_mm} onChange={(v) => set("largura_mm", v)} />
          <Campo label="Altura (mm)" value={form.altura_mm} onChange={(v) => set("altura_mm", v)} />
          <div>
            <label className="text-xs text-gray-500">Posição do chip</label>
            <input
              className={inputCls}
              value={form.posicao_rfid}
              onChange={(e) => set("posicao_rfid", e.target.value.toUpperCase())}
              placeholder="F0 / F1 / B5…"
            />
          </div>
          <Campo
            label="← Esquerda (mm)"
            value={form.offset_x_mm < 0 ? -form.offset_x_mm : 0}
            onChange={(v) => set("offset_x_mm", -Math.abs(v))}
            step={0.5}
          />
          <Campo
            label="Direita → (mm)"
            value={form.offset_x_mm > 0 ? form.offset_x_mm : 0}
            onChange={(v) => set("offset_x_mm", Math.abs(v))}
            step={0.5}
          />
          <Campo
            label="↑ Cima (mm, máx 15)"
            value={form.offset_y_mm < 0 ? -form.offset_y_mm : 0}
            onChange={(v) => set("offset_y_mm", -Math.min(15, Math.abs(v)))}
            step={0.5}
          />
          <Campo
            label="↓ Baixo (mm)"
            value={form.offset_y_mm > 0 ? form.offset_y_mm : 0}
            onChange={(v) => set("offset_y_mm", Math.abs(v))}
            step={0.5}
          />
          <label className="flex items-end gap-2 pb-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.padrao}
              onChange={(e) => set("padrao", e.target.checked)}
              className="w-4 h-4"
            />
            Modelo padrão
          </label>
        </div>

        {tid && (
          <p className="text-xs text-emerald-700">
            Chip identificado na calibração: <span className="font-mono">{tid}</span>
          </p>
        )}

        {/* Ações */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={!conectada || calibrandoMidia}
            className={btnBase + " border border-gray-400 text-gray-700 hover:bg-gray-50"}
            onClick={calibrarMidia}
          >
            {calibrandoMidia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ruler className="w-4 h-4" />}
            Calibrar mídia
          </button>
          <button
            type="button"
            disabled={!conectada || calibrando}
            className={btnBase + " bg-emerald-800 text-white hover:bg-emerald-700"}
            onClick={calibrar}
          >
            {calibrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
            Calibrar chip
          </button>
          <button
            type="button"
            disabled={!conectada || imprimindo}
            className={btnBase + " border border-emerald-800 text-emerald-800 hover:bg-emerald-50"}
            onClick={imprimirTeste}
          >
            {imprimindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Imprimir teste
          </button>
          <button
            type="button"
            disabled={salvando}
            className={btnBase + " bg-amber-500 text-white hover:bg-amber-600"}
            onClick={salvar}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar modelo
          </button>
          {form.id && (
            <button
              type="button"
              className={btnBase + " text-red-600 hover:bg-red-50 ml-auto"}
              onClick={excluir}
            >
              <Trash2 className="w-4 h-4" /> Excluir
            </button>
          )}
        </div>

        {!conectada && (
          <p className="text-xs text-amber-600">
            Impressora não conectada — calibrar e imprimir teste ficam desativados.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Fluxo: <strong>Calibrar mídia</strong> (mede a etiqueta) →{" "}
        <strong>Calibrar chip</strong> (acha a posição) → ajuste os{" "}
        <strong>deslocamentos X/Y</strong> e <strong>Imprimir teste</strong> até
        alinhar → <strong>Salvar modelo</strong>. O cadastro passa a imprimir com
        esse modelo.
      </p>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="number"
        step={step}
        className={inputCls}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
