"use client";

import { useState, useTransition } from "react";
import {
  getQuebraOperadoresBySetor,
  getQuebraOrdensByOperador,
} from "@/app/(dashboard)/quebra/actions";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  danger: "#DC2626",
  warning: "#F59E0B",
  success: "#10B981",
};

function pctColor(pct: number) {
  if (pct > 5) return C.danger;
  if (pct > 3) return C.warning;
  return C.success;
}

function fmt(v: number | string | null) {
  return Number(v ?? 0).toFixed(2);
}

function initials(nome: string) {
  return (nome ?? "??")
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0] ?? "")
    .join("")
    .toUpperCase();
}

type DrillLevel =
  | { level: "setor" }
  | { level: "operador"; setorId: number; setorNome: string }
  | {
      level: "ordem";
      setorId: number;
      setorNome: string;
      operadorId: string | null;
      operadorNome: string;
    };

interface Props {
  quebraSetor: any[];
  onClose: () => void;
}

export default function QuebraDrillDown({ quebraSetor, onClose }: Props) {
  const [drill, setDrill] = useState<DrillLevel>({ level: "setor" });
  const [operadores, setOperadores] = useState<any[]>([]);
  const [ordens, setOrdens] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  function goSetor() {
    setDrill({ level: "setor" });
  }

  function goOperador(setorId: number, setorNome: string) {
    setDrill({ level: "operador", setorId, setorNome });
    startTransition(async () => {
      const data = await getQuebraOperadoresBySetor(setorId);
      setOperadores(data);
    });
  }

  function goOrdem(
    setorId: number,
    setorNome: string,
    operadorId: string | null,
    operadorNome: string,
  ) {
    setDrill({ level: "ordem", setorId, setorNome, operadorId, operadorNome });
    startTransition(async () => {
      const data = await getQuebraOrdensByOperador(operadorId, setorId);
      setOrdens(data);
    });
  }

  // Breadcrumb
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "Fábrica", onClick: onClose },
  ];
  if (drill.level === "setor") {
    crumbs.push({ label: "Setores" });
  }
  if (drill.level === "operador") {
    crumbs.push({ label: "Setores", onClick: goSetor });
    crumbs.push({ label: drill.setorNome });
  }
  if (drill.level === "ordem") {
    crumbs.push({ label: "Setores", onClick: goSetor });
    crumbs.push({
      label: drill.setorNome,
      onClick: () => goOperador(drill.setorId, drill.setorNome),
    });
    crumbs.push({ label: drill.operadorNome });
  }

  return (
    <div
      className="bg-white rounded-xl border p-5 mb-6"
      style={{ borderColor: C.cremeBorder }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-xs" style={{ color: "#9CA3AF" }}>
                /
              </span>
            )}
            {c.onClick ? (
              <button
                onClick={c.onClick}
                className="text-sm hover:underline"
                style={{ color: C.sage }}
              >
                {c.label}
              </button>
            ) : (
              <span
                className="text-sm font-semibold"
                style={{ color: C.esmeralda }}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Loading */}
      {isPending && (
        <div className="space-y-3 py-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 rounded-lg animate-pulse"
              style={{ backgroundColor: C.creme }}
            />
          ))}
        </div>
      )}

      {/* Level: Setor */}
      {!isPending && drill.level === "setor" && (
        <div>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "#1A1A1A" }}
          >
            Quebra por Setor
          </h3>
          {quebraSetor.length === 0 ? (
            <p
              className="text-sm py-8 text-center"
              style={{ color: "#6B7280" }}
            >
              Nenhum PCP concluido com setor definido
            </p>
          ) : (
            <div className="space-y-3">
              {quebraSetor.map((s: any) => {
                const pct = Number(s.percentual_quebra);
                const cor = pctColor(Math.abs(pct));
                const bgCor =
                  Math.abs(pct) > 5
                    ? "#FEF2F2"
                    : Math.abs(pct) > 3
                      ? "#FFFBEB"
                      : "#ECFDF5";
                return (
                  <div
                    key={s.setor_id}
                    className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-2 transition-colors hover:bg-[#F3EADA]/50"
                    onClick={() =>
                      goOperador(Number(s.setor_id), s.setor_nome)
                    }
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ backgroundColor: bgCor, color: cor }}
                    >
                      {initials(s.setor_nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: "#1A1A1A" }}
                        >
                          {s.setor_nome}
                        </span>
                        <div className="flex items-center gap-4 shrink-0">
                          <span
                            className="text-[11px] font-mono"
                            style={{ color: "#6B7280" }}
                          >
                            {fmt(s.total_quebra)}g · {s.total_ordens} ordens
                          </span>
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: cor }}
                          >
                            {fmt(s.percentual_quebra)}%
                          </span>
                        </div>
                      </div>
                      <div
                        className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: C.creme }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min((Math.abs(pct) / 10) * 100, 100)}%`,
                            backgroundColor: cor,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: "#9CA3AF" }}>
                      ›
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Level: Operador */}
      {!isPending && drill.level === "operador" && (
        <div>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "#1A1A1A" }}
          >
            Operadores — {drill.setorNome}
          </h3>
          {operadores.length === 0 ? (
            <p
              className="text-sm py-8 text-center"
              style={{ color: "#6B7280" }}
            >
              Nenhum operador neste setor
            </p>
          ) : (
            <div className="space-y-3">
              {operadores.map((o: any, i: number) => {
                const pct = Number(o.percentual_medio);
                const cor = pctColor(Math.abs(pct));
                const bgCor =
                  Math.abs(pct) > 5
                    ? "#FEF2F2"
                    : Math.abs(pct) > 3
                      ? "#FFFBEB"
                      : "#ECFDF5";
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-2 transition-colors hover:bg-[#F3EADA]/50"
                    onClick={() =>
                      goOrdem(
                        drill.setorId,
                        drill.setorNome,
                        o.operador_id,
                        o.operador_nome,
                      )
                    }
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ backgroundColor: bgCor, color: cor }}
                    >
                      {initials(o.operador_nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: "#1A1A1A" }}
                        >
                          {o.operador_nome}
                        </span>
                        <div className="flex items-center gap-4 shrink-0">
                          <span
                            className="text-[11px] font-mono"
                            style={{ color: "#6B7280" }}
                          >
                            {fmt(o.total_quebra)}g · {o.total_ordens} ordens
                          </span>
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: cor }}
                          >
                            {fmt(o.percentual_medio)}%
                          </span>
                        </div>
                      </div>
                      <div
                        className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: C.creme }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min((Math.abs(pct) / 10) * 100, 100)}%`,
                            backgroundColor: cor,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: "#9CA3AF" }}>
                      ›
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Level: Ordem */}
      {!isPending && drill.level === "ordem" && (
        <div>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "#1A1A1A" }}
          >
            Ordens — {drill.operadorNome}
          </h3>
          {ordens.length === 0 ? (
            <p
              className="text-sm py-8 text-center"
              style={{ color: "#6B7280" }}
            >
              Nenhuma ordem encontrada
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-[11px] uppercase tracking-wider"
                    style={{ color: "#6B7280" }}
                  >
                    <th className="text-left py-2 px-2 font-semibold">Ordem</th>
                    <th className="text-right py-2 px-2 font-semibold">Metal</th>
                    <th className="text-right py-2 px-2 font-semibold">PMC</th>
                    <th className="text-right py-2 px-2 font-semibold">Retorno</th>
                    <th className="text-right py-2 px-2 font-semibold">Quebra</th>
                    <th className="text-right py-2 px-2 font-semibold">%</th>
                    <th className="text-right py-2 px-2 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {ordens.map((o: any) => {
                    const pct = Number(o.percentual_quebra);
                    const cor = pctColor(Math.abs(pct));
                    return (
                      <tr
                        key={o.pcp_id}
                        className="border-t hover:bg-[#F3EADA]/30"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        <td
                          className="py-2.5 px-2 font-medium"
                          style={{ color: C.esmeralda }}
                        >
                          {o.numero_ordem ?? `PCP-${o.pcp_id}`}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs">
                          {fmt(o.total_metal)}g
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs">
                          {fmt(o.pmc)}g
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs">
                          {fmt(o.retorno_metal)}g
                        </td>
                        <td
                          className="py-2.5 px-2 text-right font-mono text-xs font-bold"
                          style={{ color: cor }}
                        >
                          {fmt(o.quebra)}g
                        </td>
                        <td
                          className="py-2.5 px-2 text-right font-mono text-xs font-bold"
                          style={{ color: cor }}
                        >
                          {fmt(o.percentual_quebra)}%
                        </td>
                        <td
                          className="py-2.5 px-2 text-right text-xs"
                          style={{ color: "#6B7280" }}
                        >
                          {o.data_conclusao
                            ? new Date(o.data_conclusao).toLocaleDateString(
                                "pt-BR",
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
