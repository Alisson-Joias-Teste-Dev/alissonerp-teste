"use client";

/**
 * Camada de dados do módulo Gestão de Estoque.
 *
 * LEITURA: via /api/produtos do ERP (respeita auth, triggers e RLS)
 * ESCRITA: via /api/produtos/[id] (PATCH) — respeita validações do ERP
 * DELETE:  soft delete (situacao='I'), jamais DELETE físico
 */
import type { TableRow, SchemaName } from "./types";

// ─── READ ────────────────────────────────────────────────────────────────────

export async function fetchTableData(
  _schema: SchemaName,
  _table: string,
  page = 0,
  pageSize = 50,
  searchTerm = "",
  _searchColumns: string[] = []
): Promise<{ data: TableRow[] | null; error: unknown; count: number | null }> {
  try {
    const params = new URLSearchParams({
      limit: String(pageSize),
      page: String(page + 1), // API do ERP usa 1-based
      agrupar: "false",
      situacao: "",
    });
    if (searchTerm) params.set("busca", searchTerm);
    const res = await fetch(`/api/produtos?${params}`);
    const j = await res.json();
    if (!res.ok) return { data: null, error: j?.error ?? "Erro ao buscar", count: 0 };
    return { data: j.produtos ?? [], error: null, count: j.total ?? null };
  } catch (err) {
    return { data: null, error: err, count: 0 };
  }
}

export async function fetchDashboardData(
  _schema: SchemaName,
  _table: string,
  localId?: number | null
): Promise<{ data: TableRow[] | null; error: unknown }> {
  try {
    const url = localId
      ? `/api/gestao-estoque/produtos?local_id=${localId}`
      : `/api/gestao-estoque/produtos`;
    const res = await fetch(url);
    const j = await res.json();
    if (!res.ok) return { data: null, error: j?.error ?? "Erro" };
    return { data: j.produtos ?? [], error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function fetchColumnTotal(
  _schema: SchemaName,
  _table: string,
  _column: string
): Promise<{ total: number | null; error: unknown }> {
  return { total: null, error: null }; // não usado no fluxo atual
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export async function updateRecord(
  _schema: SchemaName,
  _table: string,
  id: string | number,
  updates: Partial<TableRow>,
  _pkField = "id"
): Promise<{ success: boolean; error: unknown }> {
  try {
    const body: Record<string, unknown> = { ...updates };
    // Convenção do ERP: categoria (sem hierarquia) → categoria_geral
    if (body.categoria !== undefined && body.categoria_geral === undefined) {
      body.categoria_geral = body.categoria;
      delete body.categoria;
    }
    const res = await fetch(`/api/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error ?? "Erro ao atualizar" };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/** Soft delete: seta situacao='I' via PATCH. Hard DELETE é proibido. */
export async function deleteRecord(
  _schema: SchemaName,
  _table: string,
  row: TableRow
): Promise<{ success: boolean; error: unknown }> {
  const id = (row.id_produto ?? row.id) as string | number | undefined;
  if (id == null) return { success: false, error: { message: "ID não identificado" } };

  try {
    const res = await fetch(`/api/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao: "I" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error ?? "Erro ao inativar" };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function discoverTables(_schema: SchemaName): Promise<string[]> {
  return ["produtos"];
}

export async function saveTableConfig(tableName: string, config: unknown): Promise<boolean> {
  try {
    localStorage.setItem(`alisson_table_config_${tableName}`, JSON.stringify(config));
    return true;
  } catch { return false; }
}

export async function loadTableConfig(tableName: string): Promise<unknown> {
  try {
    const item = localStorage.getItem(`alisson_table_config_${tableName}`);
    return item ? JSON.parse(item) : null;
  } catch { return null; }
}
