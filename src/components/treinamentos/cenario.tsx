"use client";

import { MousePointer2, Camera, Image as ImageIcon } from "lucide-react";

/**
 * PEÇAS DE CENÁRIO — blocos pra montar a "tela" de cada passo de um treinamento.
 *
 * REGRA DE NEGÓCIO: o treinamento tem que mostrar a TELA REAL do sistema. Estas
 * peças reproduzem o visual do ERP (cores da marca, cards, botões, chips) pra
 * quem escreve um treinamento novo só montar a cena — sem recriar estilo do zero
 * e sem cada treinamento ficar com uma cara diferente.
 *
 * COMO USAR: veja `.claude/commands/treinamento.md` (a receita) e o treinamento
 * de Movimentação Interna, que é o exemplo de referência.
 *
 * IMPACTO SE ALTERADO: muda a aparência de TODOS os treinamentos de uma vez.
 */

export const CT = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

// ─── Chip de status ───────────────────────────────────────────────────────────
export interface ChipDef { label: string; bg: string; color: string }

export function Chip({ def }: { def: ChipDef }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: def.bg, color: def.color }}>
      {def.label}
    </span>
  );
}

/**
 * Cria um <StatusChip s="..." /> TIPADO a partir do mapa de status do módulo.
 * REGRA: copie os rótulos e as cores do arquivo real do módulo (a função que
 * decide o status na tela) — treinamento que mostra chip diferente do sistema
 * ensina errado.
 */
export function criarStatusChip<K extends string>(mapa: Record<K, ChipDef>) {
  return function StatusChip({ s }: { s: K }) {
    return <Chip def={mapa[s]} />;
  };
}

// ─── Cursor de clique ─────────────────────────────────────────────────────────
/** Cursor + halo pulsando: mostra ONDE a pessoa clica. Põe dentro de um pai `relative`. */
export function Cursor() {
  return (
    <span className="absolute right-0 bottom-0 translate-x-[85%] translate-y-1/3 flex items-center gap-0.5 pointer-events-none">
      <span className="relative flex items-center justify-center">
        <span className="absolute w-6 h-6 rounded-full animate-ping" style={{ background: "#18403633" }} />
        <span className="w-5 h-5 rounded-full border-2" style={{ borderColor: CT.esmeralda, background: "#18403622" }} />
      </span>
      <MousePointer2 size={15} style={{ color: CT.esmeralda }} />
    </span>
  );
}

// ─── Botão ────────────────────────────────────────────────────────────────────
/** Botão da tela. `cursor` põe o cursor de clique nele (o alvo do passo). */
export function BotaoMock({ label, Icon, primario = true, cursor }: {
  label: string;
  Icon?: React.ComponentType<{ size?: number }>;
  primario?: boolean;
  cursor?: boolean;
}) {
  return (
    <span className="relative inline-flex">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
        style={primario
          ? { background: CT.esmeralda, color: CT.creme, borderColor: CT.esmeralda }
          : { background: "#fff", color: "#111827", borderColor: "#CDD3CC" }}>
        {Icon && <Icon size={12} />}{label}
      </span>
      {cursor && <Cursor />}
    </span>
  );
}

// ─── Moldura de tela (modal/página) ───────────────────────────────────────────
export function TelaMock({ titulo, children, acessorio }: { titulo?: string; children: React.ReactNode; acessorio?: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
      {titulo && (
        <div className="px-3 py-2 border-b text-[13px] font-semibold flex items-center justify-between gap-2"
          style={{ borderColor: CT.cremeBorder, color: "#111827" }}>
          {titulo}{acessorio}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

// ─── Card de registro (a linha/card que o módulo lista) ───────────────────────
export function CardMock({ titulo, sub, chip, etiquetas, children }: {
  titulo: string;
  sub?: string;
  chip?: React.ReactNode;
  etiquetas?: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate" style={{ color: "#111827" }}>{titulo}</p>
          {sub && <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{sub}</p>}
        </div>
        {chip}
      </div>
      {etiquetas && etiquetas.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {etiquetas.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border"
              style={{ borderColor: CT.cremeBorder, color: "#6B7280" }}>
              <ImageIcon size={9} /> {e}
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Aviso de foto obrigatória ────────────────────────────────────────────────
export function FotoObrigatoria({ texto = "Foto obrigatória" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 mt-2 rounded-lg border border-dashed px-2.5 py-2"
      style={{ borderColor: CT.cremeBorder, background: CT.cremeBg }}>
      <Camera size={13} style={{ color: "#8A5A0B" }} />
      <span className="text-[11px] font-medium" style={{ color: "#8A5A0B" }}>{texto}</span>
    </div>
  );
}

// ─── Linha do tempo (histórico) ───────────────────────────────────────────────
export function TimelineMock({ linhas }: { linhas: { t: string; q: string; h: string; foto?: boolean }[] }) {
  return (
    <div>
      {linhas.map((l, idx) => (
        <div key={`${l.t}-${idx}`} className="flex items-start gap-2">
          <div className="flex flex-col items-center self-stretch">
            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: CT.esmeralda }} />
            {idx < linhas.length - 1 && <span className="w-px flex-1" style={{ background: CT.cremeBorder }} />}
          </div>
          <div className="flex-1 flex items-center justify-between gap-2 pb-2.5">
            <span className="text-[12px]" style={{ color: "#111827" }}>
              {l.t} <span style={{ color: "#9CA3AF" }}>· {l.q} · {l.h}</span>
            </span>
            {l.foto && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border shrink-0"
                style={{ borderColor: CT.cremeBorder, color: "#6B7280" }}>
                <ImageIcon size={9} /> foto
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Item de menu lateral (pro passo "abra a tela X") ─────────────────────────
export function MenuMock({ grupo, itens }: { grupo: string; itens: { label: string; Icon?: React.ComponentType<{ size?: number }>; ativo?: boolean }[] }) {
  return (
    <div className="rounded-xl border overflow-hidden text-[12px]" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
      <div className="px-3 py-2 border-b font-semibold" style={{ borderColor: CT.cremeBorder, color: "#9CA3AF" }}>{grupo}</div>
      {itens.map((it) => (
        <div key={it.label} className="px-3 py-2 flex items-center justify-between"
          style={it.ativo ? { background: "#18403610", color: CT.esmeralda, fontWeight: 600 } : { color: "#6B7280" }}>
          <span className="inline-flex items-center gap-1.5">{it.Icon && <it.Icon size={13} />}{it.label}</span>
          {it.ativo && <span className="relative w-3 h-3"><Cursor /></span>}
        </div>
      ))}
    </div>
  );
}

/** Negrito curto pra usar dentro da narração. */
export const nb = (t: string) => <b style={{ color: "#111827" }}>{t}</b>;
