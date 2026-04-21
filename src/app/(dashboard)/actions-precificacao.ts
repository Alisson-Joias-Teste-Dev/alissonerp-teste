"use server";

import sql from "@/lib/db";
import type { AppConfig, BackupRecord } from "@/types/precificacao";

/**
 * Salva um snapshot de configuração — histórico eterno (nunca sobrescreve).
 */
export async function saveConfigAction(
  config: AppConfig,
  label?: string,
): Promise<void> {
  await sql`
    INSERT INTO alissonerp.precificacao_config (content, label, updated_at)
    VALUES (${JSON.stringify(config)}::jsonb, ${label ?? null}, NOW())
  `;
}

/**
 * Lista backups disponíveis (últimos 100).
 */
export async function fetchBackupsAction(): Promise<BackupRecord[]> {
  const rows = await sql`
    SELECT id::text, updated_at, label
    FROM alissonerp.precificacao_config
    ORDER BY updated_at DESC
    LIMIT 100
  `;
  return rows.map((r) => ({
    id: String(r.id),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    label: r.label,
  }));
}

/**
 * Busca configuração por ID, ou a mais recente se id não passado.
 */
export async function fetchConfigAction(
  id?: string,
): Promise<AppConfig | null> {
  if (id) {
    const [row] = await sql`
      SELECT content FROM alissonerp.precificacao_config
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return (row?.content as AppConfig) ?? null;
  }
  const [row] = await sql`
    SELECT content FROM alissonerp.precificacao_config
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return (row?.content as AppConfig) ?? null;
}

/**
 * Registra um cálculo no histórico.
 */
export interface CalculationRecord {
  gold_price: number;
  weight: number;
  mkp: number;
  commission_percent?: number;
  commission_value?: number;
  base_price: number;
  final_price: number;
  discount_percent: number;
  category_name: string;
}

export async function saveHistoricoAction(r: CalculationRecord): Promise<void> {
  await sql`
    INSERT INTO alissonerp.precificacao_historico (
      gold_price, weight, mkp,
      commission_percent, commission_value,
      base_price, final_price, discount_percent,
      category_name
    ) VALUES (
      ${r.gold_price}, ${r.weight}, ${r.mkp},
      ${r.commission_percent ?? null}, ${r.commission_value ?? null},
      ${r.base_price}, ${r.final_price}, ${r.discount_percent},
      ${r.category_name}
    )
  `;
}
