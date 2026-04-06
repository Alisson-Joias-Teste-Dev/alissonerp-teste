"use client";

import { useState } from "react";

// ─── Constantes ─────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg:          "#FAFAF7",
};

export const TIPOS_ITEM = [
  { value: "alianca",       label: "Uma aliança" },
  { value: "par_alianca",   label: "Um Par de aliança" },
  { value: "corrente",      label: "Corrente" },
  { value: "anel",          label: "Anel" },
  { value: "pingente",      label: "Pingente" },
  { value: "bracelete",     label: "Bracelete" },
  { value: "escapulario",   label: "Escapulário" },
  { value: "brinco",        label: "Brinco" },
  { value: "tornozeleira",  label: "Tornozeleira" },
  { value: "pulseira",      label: "Pulseira" },
  { value: "colar_nome",    label: "Colar com nome" },
  { value: "monograma",     label: "Monograma" },
] as const;

export type TipoItem = (typeof TIPOS_ITEM)[number]["value"];

const MODELOS_ALIANCA = [
  "Safira (Quadrada Lisa)", "Esmeralda (Boleada Lisa)", "Cristal", "Opala",
  "Turquesa", "Granada", "Água Marinha", "Bordas Elevadas", "Jade",
  "Quartzo Rosa", "Ametista", "Turmalina Paraíba",
  "Friso + corda + meia lua de pedras", "Dois frisos + corda",
];

const TIPOS_ELO = [
  "Cartier quadrado", "Cartier aberto", "Veneziano", "Piastrine",
  "Elo português", "Cingapura", "Corda", "Bismarck", "Garimpeiro",
  "Palmeira", "Escama de peixe", "Grummert", "Baguet", "3 em 1", "Outro",
];

const TIPOS_FECHO = ["Boia", "Anzol", "Batom", "Caixa", "Imã", "Outro"];

const MODELO_INTERNO_ALIANCA = ["Confort", "Reta"];
const MODELO_INTERNO_ANEL    = ["Ocado", "Confort", "Reto", "Semi-confort"];
const MODELO_EXTERNO         = ["Boleado", "Quadrado", "Duplo"];
const TIPOS_FONTE            = ["Forma", "Cursiva", "Sem Gravação"];
const TIPOS_TARRAXA          = ["Pressão", "Rosca", "Porca", "Outro"];
const MODELOS_PINGENTE       = ["Crucifixo", "Medalha", "Ponto de luz", "Coração", "Outro"];
const NUMERACOES             = Array.from({ length: 36 }, (_, i) => String(i + 1));

// ─── Types ──────────────────────────────────────────────────────────────────
export interface FichaTecnicaDados {
  tipo_item: TipoItem;
  [key: string]: string | undefined;
}

interface FichaTecnicaFormProps {
  dados: FichaTecnicaDados;
  onChange: (dados: FichaTecnicaDados) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        inputMode="decimal"
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
        style={{ borderColor: C.cremeBorder }}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-white"
        style={{ borderColor: C.cremeBorder }}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder ?? `Selecione...`}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Campos por tipo ────────────────────────────────────────────────────────
function CamposAlianca({ dados, set, prefix }: { dados: FichaTecnicaDados; set: (k: string, v: string) => void; prefix?: string }) {
  const p = prefix ? `${prefix}_` : "";
  return (
    <>
      <InputField label={`Milimetragem${prefix ? ` ${prefix}` : ""}`} value={dados[`${p}milimetragem`] ?? ""} onChange={v => set(`${p}milimetragem`, v)} placeholder="Ex: 3, 5" required />
      <SelectField label={`Numeração${prefix ? ` ${prefix}` : ""}`} value={dados[`${p}numeracao`] ?? ""} onChange={v => set(`${p}numeracao`, v)} options={NUMERACOES} required />
      <SelectField label={`Modelo${prefix ? ` ${prefix}` : ""}`} value={dados[`${p}modelo`] ?? ""} onChange={v => set(`${p}modelo`, v)} options={MODELOS_ALIANCA} required />
      <SelectField label={`Modelo Interno${prefix ? ` ${prefix}` : ""}`} value={dados[`${p}modelo_interno`] ?? ""} onChange={v => set(`${p}modelo_interno`, v)} options={MODELO_INTERNO_ALIANCA} required />
      <SelectField label={`Tipo de Fonte${prefix ? ` ${prefix}` : ""}`} value={dados[`${p}tipo_fonte`] ?? ""} onChange={v => set(`${p}tipo_fonte`, v)} options={TIPOS_FONTE} required />
      {dados[`${p}tipo_fonte`] && dados[`${p}tipo_fonte`] !== "Sem Gravação" && (
        <InputField label={`Texto da Gravação${prefix ? ` ${prefix}` : ""}`} value={dados[`${p}texto_gravacao`] ?? ""} onChange={v => set(`${p}texto_gravacao`, v)} placeholder="Texto a ser gravado" />
      )}
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function FichaTecnicaForm({ dados, onChange }: FichaTecnicaFormProps) {
  function set(key: string, value: string) {
    onChange({ ...dados, [key]: value });
  }

  function setTipo(tipo: TipoItem) {
    // Reseta dados ao trocar tipo, mantendo só tipo_item
    onChange({ tipo_item: tipo });
  }

  const tipo = dados.tipo_item;

  return (
    <div className="space-y-4">
      {/* Tipo de Item */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">
          Tipo de Item <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-white"
          style={{ borderColor: C.cremeBorder }}
          value={tipo}
          onChange={e => setTipo(e.target.value as TipoItem)}
        >
          <option value="">Selecione o tipo de item</option>
          {TIPOS_ITEM.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Campos dinâmicos */}
      {tipo === "alianca" && <CamposAlianca dados={dados} set={set} />}

      {tipo === "par_alianca" && (
        <>
          <div className="border-l-2 pl-3 space-y-3" style={{ borderColor: C.esmeralda }}>
            <p className="text-xs font-bold" style={{ color: C.esmeralda }}>Aliança 1</p>
            <CamposAlianca dados={dados} set={set} prefix="1" />
          </div>
          <div className="border-l-2 pl-3 space-y-3" style={{ borderColor: "#6B21A8" }}>
            <p className="text-xs font-bold" style={{ color: "#6B21A8" }}>Aliança 2</p>
            <CamposAlianca dados={dados} set={set} prefix="2" />
          </div>
        </>
      )}

      {tipo === "corrente" && (
        <>
          <InputField label="Milimetragem" value={dados.milimetragem ?? ""} onChange={v => set("milimetragem", v)} placeholder="Ex: 3, 5" />
          <InputField label="Comprimento (cm)" value={dados.comprimento_cm ?? ""} onChange={v => set("comprimento_cm", v)} placeholder="Ex: 45, 50" required />
          <SelectField label="Tipo de Elo" value={dados.tipo_elo ?? ""} onChange={v => set("tipo_elo", v)} options={TIPOS_ELO} required />
          <SelectField label="Tipo de Fecho" value={dados.tipo_fecho ?? ""} onChange={v => set("tipo_fecho", v)} options={TIPOS_FECHO} required />
        </>
      )}

      {tipo === "anel" && (
        <>
          <InputField label="Modelo do Anel" value={dados.modelo_anel ?? ""} onChange={v => set("modelo_anel", v)} placeholder="Ex: Solitário, Aparador" required />
          <SelectField label="Numeração" value={dados.numeracao ?? ""} onChange={v => set("numeracao", v)} options={NUMERACOES} required />
          <InputField label="Milimetragem da Base (mm)" value={dados.milimetragem_base_mm ?? ""} onChange={v => set("milimetragem_base_mm", v)} placeholder="Ex: 10" required />
          <InputField label="Milimetragem do Aro (mm)" value={dados.milimetragem_aro_mm ?? ""} onChange={v => set("milimetragem_aro_mm", v)} placeholder="Ex: 10" required />
          <SelectField label="Modelo Interno" value={dados.modelo_interno ?? ""} onChange={v => set("modelo_interno", v)} options={MODELO_INTERNO_ANEL} required />
          <SelectField label="Modelo Externo" value={dados.modelo_externo ?? ""} onChange={v => set("modelo_externo", v)} options={MODELO_EXTERNO} required />
        </>
      )}

      {tipo === "pingente" && (
        <>
          <InputField label="Milimetragem" value={dados.milimetragem ?? ""} onChange={v => set("milimetragem", v)} placeholder="Ex: 3, 5" />
          <SelectField label="Modelo do Pingente" value={dados.modelo_pingente ?? ""} onChange={v => set("modelo_pingente", v)} options={MODELOS_PINGENTE} required />
          <InputField label="Altura do Pingente (mm)" value={dados.altura_mm ?? ""} onChange={v => set("altura_mm", v)} placeholder="Ex: 15" required />
          <InputField label="Largura do Pingente (mm)" value={dados.largura_mm ?? ""} onChange={v => set("largura_mm", v)} placeholder="Ex: 10" required />
        </>
      )}

      {tipo === "bracelete" && (
        <>
          <InputField label="Milimetragem" value={dados.milimetragem ?? ""} onChange={v => set("milimetragem", v)} placeholder="Ex: 3, 5" />
          <InputField label="Modelo" value={dados.modelo ?? ""} onChange={v => set("modelo", v)} placeholder="Ex: Rígido, Flexível" />
          <SelectField label="Tipo de Fecho" value={dados.tipo_fecho ?? ""} onChange={v => set("tipo_fecho", v)} options={TIPOS_FECHO} required />
          <SelectField label="Modelo Externo" value={dados.modelo_externo ?? ""} onChange={v => set("modelo_externo", v)} options={MODELO_EXTERNO} />
        </>
      )}

      {tipo === "escapulario" && (
        <>
          <InputField label="Altura da Placa (mm)" value={dados.altura_placa_mm ?? ""} onChange={v => set("altura_placa_mm", v)} placeholder="Ex: 20" required />
          <InputField label="Largura da Placa (mm)" value={dados.largura_placa_mm ?? ""} onChange={v => set("largura_placa_mm", v)} placeholder="Ex: 15" required />
          <InputField label="Espessura da Chapa (mm)" value={dados.espessura_chapa_mm ?? ""} onChange={v => set("espessura_chapa_mm", v)} placeholder="Ex: 1" required />
          <SelectField label="Tipo de Fecho" value={dados.tipo_fecho ?? ""} onChange={v => set("tipo_fecho", v)} options={TIPOS_FECHO} />
        </>
      )}

      {tipo === "brinco" && (
        <>
          <InputField label="Milimetragem" value={dados.milimetragem ?? ""} onChange={v => set("milimetragem", v)} placeholder="Ex: 3, 5" />
          <InputField label="Modelo" value={dados.modelo ?? ""} onChange={v => set("modelo", v)} placeholder="Ex: Argola, Ponto de luz" />
          <SelectField label="Tipo de Tarraxa" value={dados.tipo_tarraxa ?? ""} onChange={v => set("tipo_tarraxa", v)} options={TIPOS_TARRAXA} required />
        </>
      )}

      {(tipo === "tornozeleira" || tipo === "pulseira") && (
        <>
          <InputField label="Milimetragem" value={dados.milimetragem ?? ""} onChange={v => set("milimetragem", v)} placeholder="Ex: 3, 5" />
          <InputField label="Comprimento (cm)" value={dados.comprimento_cm ?? ""} onChange={v => set("comprimento_cm", v)} placeholder="Ex: 45, 50" required />
          <SelectField label="Tipo de Elo" value={dados.tipo_elo ?? ""} onChange={v => set("tipo_elo", v)} options={TIPOS_ELO} required />
          <SelectField label="Tipo de Fecho" value={dados.tipo_fecho ?? ""} onChange={v => set("tipo_fecho", v)} options={TIPOS_FECHO} required />
        </>
      )}

      {tipo === "colar_nome" && (
        <>
          <InputField label="Altura da Placa (mm)" value={dados.altura_placa_mm ?? ""} onChange={v => set("altura_placa_mm", v)} placeholder="Ex: 20" />
          <InputField label="Largura da Placa (mm)" value={dados.largura_placa_mm ?? ""} onChange={v => set("largura_placa_mm", v)} placeholder="Ex: 50" />
          <InputField label="Espessura da Chapa (mm)" value={dados.espessura_chapa_mm ?? ""} onChange={v => set("espessura_chapa_mm", v)} placeholder="Ex: 1" />
          <InputField label="Nome na Chapa" value={dados.nome_chapa ?? ""} onChange={v => set("nome_chapa", v)} placeholder="Nome a ser gravado" required />
          <SelectField label="Tipo de Fonte" value={dados.tipo_fonte ?? ""} onChange={v => set("tipo_fonte", v)} options={TIPOS_FONTE} />
        </>
      )}

      {tipo === "monograma" && (
        <>
          <InputField label="Altura da Placa (mm)" value={dados.altura_placa_mm ?? ""} onChange={v => set("altura_placa_mm", v)} placeholder="Ex: 20" required />
          <InputField label="Largura da Placa (mm)" value={dados.largura_placa_mm ?? ""} onChange={v => set("largura_placa_mm", v)} placeholder="Ex: 20" required />
          <InputField label="Espessura da Chapa (mm)" value={dados.espessura_chapa_mm ?? ""} onChange={v => set("espessura_chapa_mm", v)} placeholder="Ex: 1" required />
          <InputField label="Texto do Monograma" value={dados.texto_monograma ?? ""} onChange={v => set("texto_monograma", v)} placeholder="Texto a ser gravado" required />
          <SelectField label="Tipo de Fonte" value={dados.tipo_fonte ?? ""} onChange={v => set("tipo_fonte", v)} options={TIPOS_FONTE} />
        </>
      )}
    </div>
  );
}

// ─── Validação ──────────────────────────────────────────────────────────────
export function validarFichaTecnica(dados: FichaTecnicaDados): string | null {
  const t = dados.tipo_item;
  if (!t) return "Selecione o tipo de item.";

  const req = (campo: string, label: string) =>
    !dados[campo]?.trim() ? `${label} é obrigatório.` : null;

  if (t === "alianca") {
    return req("milimetragem", "Milimetragem") ?? req("numeracao", "Numeração") ?? req("modelo", "Modelo") ?? req("modelo_interno", "Modelo Interno") ?? req("tipo_fonte", "Tipo de Fonte") ?? null;
  }
  if (t === "par_alianca") {
    return req("1_milimetragem", "Milimetragem 1") ?? req("1_numeracao", "Numeração 1") ?? req("1_modelo", "Modelo 1") ?? req("1_modelo_interno", "Modelo Interno 1") ?? req("1_tipo_fonte", "Tipo de Fonte 1")
      ?? req("2_milimetragem", "Milimetragem 2") ?? req("2_numeracao", "Numeração 2") ?? req("2_modelo", "Modelo 2") ?? req("2_modelo_interno", "Modelo Interno 2") ?? req("2_tipo_fonte", "Tipo de Fonte 2") ?? null;
  }
  if (t === "corrente") {
    return req("comprimento_cm", "Comprimento") ?? req("tipo_elo", "Tipo de Elo") ?? req("tipo_fecho", "Tipo de Fecho") ?? null;
  }
  if (t === "anel") {
    return req("modelo_anel", "Modelo do Anel") ?? req("numeracao", "Numeração") ?? req("milimetragem_base_mm", "Milimetragem da Base") ?? req("milimetragem_aro_mm", "Milimetragem do Aro") ?? req("modelo_interno", "Modelo Interno") ?? req("modelo_externo", "Modelo Externo") ?? null;
  }
  if (t === "pingente") {
    return req("modelo_pingente", "Modelo do Pingente") ?? req("altura_mm", "Altura") ?? req("largura_mm", "Largura") ?? null;
  }
  if (t === "bracelete") {
    return req("tipo_fecho", "Tipo de Fecho") ?? null;
  }
  if (t === "escapulario") {
    return req("altura_placa_mm", "Altura da Placa") ?? req("largura_placa_mm", "Largura da Placa") ?? req("espessura_chapa_mm", "Espessura da Chapa") ?? null;
  }
  if (t === "brinco") {
    return req("tipo_tarraxa", "Tipo de Tarraxa") ?? null;
  }
  if (t === "tornozeleira" || t === "pulseira") {
    return req("comprimento_cm", "Comprimento") ?? req("tipo_elo", "Tipo de Elo") ?? req("tipo_fecho", "Tipo de Fecho") ?? null;
  }
  if (t === "colar_nome") {
    return req("nome_chapa", "Nome na Chapa") ?? null;
  }
  if (t === "monograma") {
    return req("altura_placa_mm", "Altura da Placa") ?? req("largura_placa_mm", "Largura da Placa") ?? req("espessura_chapa_mm", "Espessura da Chapa") ?? req("texto_monograma", "Texto do Monograma") ?? null;
  }
  return null;
}
