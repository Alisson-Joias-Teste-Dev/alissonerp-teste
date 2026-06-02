/**
 * REGRA DE NEGÓCIO: componente reutilizável de evidências da limpeza de ouro.
 *
 * O QUE: busca dados da última tentativa em alissonerp.limpezas_ouro via
 *   GET /api/purificacao/limpeza?baixa_id={baixaId} e renderiza fotos antes/
 *   depois, pesos e evidência de pedras.
 * POR QUE: centraliza a exibição para evitar duplicação entre o card de
 *   aprovações pendentes (TarefasClient), o drawer de tarefa (TarefaDrawer) e
 *   o bottom sheet de aprovação inline (AprovacaoBottomSheet).
 * IMPACTO SE REMOVIDO: aprovador não vê as fotos obrigatórias da v2.
 */

"use client";

import { useState, useEffect } from "react";
import { getPublicUrl } from "@/lib/storage-url";

export interface EvidenciaLimpezaData {
  id: number;
  gramas: number;
  destino: string;
  limpeza_peso_limpo: number | null;
  limpeza_perda_bruta_g: number | null;
  limpeza_perda_bruta_pct: number | null;
  limpeza_perda_ouro_g: number | null;
  limpeza_perda_ouro_pct: number | null;
  limpeza_houve_pedras: boolean | null;
  limpeza_peso_pedras: number | null;
  limpeza_foto_antes_path: string | null;
  limpeza_foto_depois_path: string | null;
  limpeza_foto_peso_pedras_path: string | null;
}

interface Props {
  baixaId: number;
  compact?: boolean;
}

export function EvidenciasLimpeza({ baixaId, compact = false }: Props) {
  const [data, setData] = useState<EvidenciaLimpezaData | null>(null);

  useEffect(() => {
    if (!baixaId || baixaId <= 0) return;
    fetch(`/api/purificacao/limpeza?baixa_id=${baixaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, [baixaId]);

  if (!data) return null;

  if (compact) {
    return (
      <div className="mt-2 space-y-2">
        <div className="text-[11px] font-semibold mb-1" style={{ color: "#5B21B6" }}>
          Evidências da Limpeza — {Number(data.gramas).toFixed(3)}g sujo → {data.limpeza_peso_limpo != null ? `${Number(data.limpeza_peso_limpo).toFixed(3)}g limpo` : "—"}
          {data.limpeza_perda_ouro_g != null ? ` (quebra ouro: ${Number(data.limpeza_perda_ouro_g).toFixed(3)}g)` : ""}
        </div>
        <div className="flex gap-2 flex-wrap">
          {data.limpeza_foto_antes_path && (
            <a
              href={getPublicUrl("purificacao-fotos", data.limpeza_foto_antes_path)}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg overflow-hidden border flex-shrink-0"
              style={{ borderColor: "#DDD6FE" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPublicUrl("purificacao-fotos", data.limpeza_foto_antes_path)}
                alt="Antes da limpeza"
                className="w-20 h-20 object-cover"
              />
              <p className="text-[10px] font-semibold px-1.5 py-0.5 text-center" style={{ color: "#5B21B6", backgroundColor: "#F5F3FF" }}>
                Antes
              </p>
            </a>
          )}
          {data.limpeza_foto_depois_path && (
            <a
              href={getPublicUrl("purificacao-fotos", data.limpeza_foto_depois_path)}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg overflow-hidden border flex-shrink-0"
              style={{ borderColor: "#DDD6FE" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPublicUrl("purificacao-fotos", data.limpeza_foto_depois_path)}
                alt="Depois da limpeza"
                className="w-20 h-20 object-cover"
              />
              <p className="text-[10px] font-semibold px-1.5 py-0.5 text-center" style={{ color: "#5B21B6", backgroundColor: "#F5F3FF" }}>
                Depois
              </p>
            </a>
          )}
          {data.limpeza_houve_pedras && data.limpeza_foto_peso_pedras_path && (
            <a
              href={getPublicUrl("purificacao-fotos", data.limpeza_foto_peso_pedras_path)}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg overflow-hidden border flex-shrink-0"
              style={{ borderColor: "#DDD6FE" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPublicUrl("purificacao-fotos", data.limpeza_foto_peso_pedras_path)}
                alt={`Pedras: ${data.limpeza_peso_pedras != null ? `${Number(data.limpeza_peso_pedras).toFixed(3)}g` : "—"}`}
                className="w-20 h-20 object-cover"
              />
              <p className="text-[10px] font-semibold px-1.5 py-0.5 text-center" style={{ color: "#5B21B6", backgroundColor: "#F5F3FF" }}>
                Pedras
              </p>
            </a>
          )}
        </div>
        {data.limpeza_houve_pedras && (
          <p className="text-[11px]" style={{ color: "#7C3AED" }}>
            Pedras removidas: {data.limpeza_peso_pedras != null ? `${Number(data.limpeza_peso_pedras).toFixed(3)}g` : "—"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "#7C3AED33", backgroundColor: "#F5F3FF" }}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold" style={{ color: "#5B21B6" }}>
          Evidências da Limpeza
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div
          className="rounded-lg bg-white p-2 border"
          style={{ borderColor: "#DDD6FE" }}
        >
          <p style={{ color: "#6B7280" }}>Peso sujo</p>
          <p className="font-bold" style={{ color: "#111827" }}>
            {Number(data.gramas).toFixed(3)}g
          </p>
        </div>
        <div
          className="rounded-lg bg-white p-2 border"
          style={{ borderColor: "#DDD6FE" }}
        >
          <p style={{ color: "#6B7280" }}>Peso limpo</p>
          <p className="font-bold" style={{ color: "#111827" }}>
            {data.limpeza_peso_limpo != null
              ? `${Number(data.limpeza_peso_limpo).toFixed(3)}g`
              : "-"}
          </p>
        </div>
        <div
          className="rounded-lg bg-white p-2 border"
          style={{ borderColor: "#DDD6FE" }}
        >
          <p style={{ color: "#6B7280" }}>Perda bruta</p>
          <p className="font-bold" style={{ color: "#111827" }}>
            {data.limpeza_perda_bruta_g != null
              ? `${Number(data.limpeza_perda_bruta_g).toFixed(3)}g`
              : "-"}
          </p>
        </div>
        <div
          className="rounded-lg bg-white p-2 border"
          style={{ borderColor: "#DDD6FE" }}
        >
          <p style={{ color: "#6B7280" }}>Quebra real ouro</p>
          <p className="font-bold" style={{ color: "#111827" }}>
            {data.limpeza_perda_ouro_g != null
              ? `${Number(data.limpeza_perda_ouro_g).toFixed(3)}g`
              : "-"}
          </p>
          {data.limpeza_perda_ouro_pct != null && (
            <p className="text-[10px]" style={{ color: "#6B7280" }}>
              {Number(data.limpeza_perda_ouro_pct).toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {data.limpeza_foto_antes_path && (
          <a
            href={getPublicUrl(
              "purificacao-fotos",
              data.limpeza_foto_antes_path,
            )}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl overflow-hidden border bg-white"
            style={{ borderColor: "#DDD6FE" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPublicUrl(
                "purificacao-fotos",
                data.limpeza_foto_antes_path,
              )}
              alt="Antes da limpeza"
              className="w-full h-28 object-cover"
            />
            <p
              className="text-[11px] font-semibold px-2 py-1"
              style={{ color: "#5B21B6" }}
            >
              Antes
            </p>
          </a>
        )}
        {data.limpeza_foto_depois_path && (
          <a
            href={getPublicUrl(
              "purificacao-fotos",
              data.limpeza_foto_depois_path,
            )}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl overflow-hidden border bg-white"
            style={{ borderColor: "#DDD6FE" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPublicUrl(
                "purificacao-fotos",
                data.limpeza_foto_depois_path,
              )}
              alt="Depois da limpeza"
              className="w-full h-28 object-cover"
            />
            <p
              className="text-[11px] font-semibold px-2 py-1"
              style={{ color: "#5B21B6" }}
            >
              Depois
            </p>
          </a>
        )}
      </div>

      {data.limpeza_houve_pedras && (
        <div
          className="rounded-xl border bg-white p-3 space-y-2"
          style={{ borderColor: "#DDD6FE" }}
        >
          <p className="text-xs font-semibold" style={{ color: "#5B21B6" }}>
            Pedras removidas:{" "}
            {data.limpeza_peso_pedras != null
              ? `${Number(data.limpeza_peso_pedras).toFixed(3)}g`
              : "peso não informado"}
          </p>
          {data.limpeza_foto_peso_pedras_path && (
            <a
              href={getPublicUrl(
                "purificacao-fotos",
                data.limpeza_foto_peso_pedras_path,
              )}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg overflow-hidden border"
              style={{ borderColor: "#DDD6FE" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPublicUrl(
                  "purificacao-fotos",
                  data.limpeza_foto_peso_pedras_path,
                )}
                alt="Peso das pedras"
                className="w-full h-32 object-cover"
              />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Extrai o baixa_id da tag limpeza_ouro:{id} de um array de tags de tarefa.
 * Usado para decidir se o card/bottom sheet deve exibir as evidências.
 * O QUE: parseia string "limpeza_ouro:13" → 13.
 * POR QUE: evita duplicar a lógica de extração em cada componente.
 * IMPACTO SE REMOVIDO: cada caller precisa implementar a extração manualmente.
 */
export function extrairBaixaIdLimpeza(
  tags: string[] | null | undefined,
): number {
  if (!tags || !Array.isArray(tags)) return 0;
  const tag = tags.find((t) => String(t).startsWith("limpeza_ouro:"));
  if (!tag) return 0;
  return Number(tag.split(":")[1] ?? 0);
}
