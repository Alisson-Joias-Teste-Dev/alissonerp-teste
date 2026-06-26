"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Grid, LayoutDashboard, Layers, Sparkles } from "lucide-react";
import DataGrid from "@/components/gestao-estoque/DataGrid";
import Dashboard from "@/components/gestao-estoque/Dashboard";
import InventoryTab from "@/components/gestao-estoque/InventoryTab";
import SecurityModal from "@/components/gestao-estoque/SecurityModal";
import PromotionModal from "@/components/gestao-estoque/PromotionModal";
import AIChat from "@/components/gestao-estoque/AIChat";
import {
  fetchTableData,
  fetchDashboardData,
  deleteRecord,
} from "@/lib/gestao-estoque/service";
import type { PromotionConflito } from "@/components/gestao-estoque/PromotionModal";
import {
  SchemaName,
  TableRow,
  ViewMode,
  DEFAULT_PAGE_SIZE,
} from "@/lib/gestao-estoque/types";

const FIXED_SCHEMA: SchemaName = "public";
const FIXED_TABLE = "produtos";

export default function GestaoEstoqueClient() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");

  const [data, setData] = useState<TableRow[]>([]);
  const [dashboardData, setDashboardData] = useState<TableRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [notification, setNotification] =
    useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<{ type: "edit" | "delete"; row: TableRow } | null>(null);

  const [isPromotionOpen, setIsPromotionOpen] = useState(false);
  const [selectedForPromo, setSelectedForPromo] = useState<TableRow[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);

  const [isAIOpen, setIsAIOpen] = useState(false);

  const [locais, setLocais] = useState<{ id: number; nome: string }[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/gestao-estoque/locais")
      .then(r => r.ok ? r.json() : [])
      .then(data => Array.isArray(data) && data.length > 1 ? setLocais(data) : null)
      .catch(() => null);
  }, []);

  const getSearchableColumns = (cols: string[]) => {
    const likelyText = [
      "name", "title", "description", "email", "sku", "code", "slug",
      "nome", "titulo", "descricao", "status", "type", "modelo", "marca", "category",
    ];
    return cols.filter((c) => likelyText.some((lc) => c.toLowerCase().includes(lc)));
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (viewMode === "grid") {
      let searchCols: string[] = [];
      if (searchTerm && columns.length > 0) {
        searchCols = getSearchableColumns(columns);
        if (searchCols.length === 0) {
          searchCols = ["name", "title", "nome", "descricao", "sku", "code"];
        }
      }

      const { data: fetchedData, error: fetchError, count: fetchedCount } =
        await fetchTableData(
          FIXED_SCHEMA,
          FIXED_TABLE,
          page,
          DEFAULT_PAGE_SIZE,
          searchTerm,
          searchCols
        );

      if (fetchError) {
        console.error("Erro:", fetchError);
        const msg = (fetchError as { message?: string })?.message ?? JSON.stringify(fetchError);
        setError(msg);
        setData([]);
        if (page === 0 && !searchTerm) {
          setColumns([]);
          setCount(0);
        }
      } else {
        setData(fetchedData || []);
        setCount(fetchedCount);
        if (fetchedData && fetchedData.length > 0 && columns.length === 0) {
          const allKeys = new Set<string>();
          fetchedData.slice(0, 5).forEach((row) => {
            Object.keys(row).forEach((k) => allKeys.add(k));
          });
          setColumns(Array.from(allKeys));
        }
      }
    } else {
      const { data: dashData, error: dashError } = await fetchDashboardData(FIXED_SCHEMA, FIXED_TABLE, selectedLocal);
      if (dashError) {
        const msg = (dashError as { message?: string })?.message ?? JSON.stringify(dashError);
        setError(msg);
        setDashboardData([]);
      } else {
        setDashboardData(dashData || []);
        if (dashData && dashData.length > 0) {
          const allKeys = new Set<string>();
          dashData.slice(0, 5).forEach((row) => {
            Object.keys(row).forEach((k) => allKeys.add(k));
          });
          const newCols = Array.from(allKeys);
          if (JSON.stringify(newCols) !== JSON.stringify(columns)) {
            setColumns(newCols);
          }
        }
      }
    }
    setLoading(false);
  }, [page, viewMode, searchTerm, columns, selectedLocal]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, viewMode, searchTerm, selectedLocal]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    setSearchTerm("");
    setError(null);
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setPage(0);
  };

  const handleActionAttempt = (type: "edit" | "delete", row: TableRow) => {
    setPendingAction({ type, row });
    setIsSecurityOpen(true);
  };

  const executePendingAction = async () => {
    setIsSecurityOpen(false);
    if (!pendingAction) return;

    if (pendingAction.type === "delete") {
      const { success, error } = await deleteRecord(FIXED_SCHEMA, FIXED_TABLE, pendingAction.row);
      if (success) {
        setNotification({ msg: "Produto inativado (soft delete).", type: "success" });
        loadData();
      } else {
        const msg = (error as { message?: string })?.message ?? String(error);
        setNotification({ msg: `Falha ao inativar: ${msg}`, type: "error" });
      }
    } else if (pendingAction.type === "edit") {
      setNotification({
        msg: "Modo Edição liberado — use o drawer do ERP em /produtos para edições detalhadas.",
        type: "success",
      });
    }

    setTimeout(() => setNotification(null), 3000);
    setPendingAction(null);
  };

  const handlePromotionRequest = (selected: TableRow[]) => {
    setSelectedForPromo(selected);
    setIsPromotionOpen(true);
  };

  const handlePromotionConfirm = async (payload: {
    nome_campanha: string;
    data_inicio: string;
    data_fim: string;
    itens: { produto_id: number; preco_promo: number }[];
  }): Promise<PromotionConflito[] | null> => {
    setPromoLoading(true);
    try {
      const res = await fetch("/api/promocoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        const body = await res.json();
        return (body.conflitos ?? []) as PromotionConflito[];
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setNotification({ msg: body.error ?? "Falha ao criar promocao", type: "error" });
        setTimeout(() => setNotification(null), 3000);
        return null;
      }
      const data = await res.json();
      setIsPromotionOpen(false);
      setNotification({
        msg: `Campanha "${data.nome_campanha}" criada com ${data.itens_count} itens.`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 4000);
      loadData();
      return null;
    } catch (err) {
      setNotification({ msg: `Erro de rede: ${String(err)}`, type: "error" });
      setTimeout(() => setNotification(null), 3000);
      return null;
    } finally {
      setPromoLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] min-w-0 bg-creme-50 text-gray-900 font-sans overflow-hidden">
      {/* Toolbar superior — substitui o sidebar interno */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 bg-white border-b border-creme-200">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-sm font-serif font-bold text-alisson-gold tracking-wide leading-none">ALISSON</h2>
            <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 mt-0.5">Gestão de Estoque</p>
          </div>
          <div className="h-6 w-px bg-creme-200" />
          <div className="grid grid-cols-3 p-0.5 bg-creme-50 rounded-lg border border-creme-200">
            {([
              { id: "grid", label: "Grade", Icon: Grid },
              { id: "dashboard", label: "Análises", Icon: LayoutDashboard },
              { id: "inventory", label: "Estoque", Icon: Layers },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => handleViewChange(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === id
                    ? "bg-alisson-gold text-white shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {locais.length > 1 && (
            <div className="flex items-center gap-1 p-0.5 bg-creme-50 rounded-lg border border-creme-200">
              <button
                onClick={() => setSelectedLocal(null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedLocal === null
                    ? "bg-alisson-gold text-white shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Todos
              </button>
              {locais.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLocal(l.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    selectedLocal === l.id
                      ? "bg-alisson-gold text-white shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {l.nome}
                </button>
              ))}
            </div>
          )}
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono hidden md:inline">
            public.produtos
          </span>
          <button
            onClick={() => setIsAIOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-alisson-gold border border-alisson-gold/40 hover:bg-alisson-gold/5 transition-colors"
            title="Abrir Alisson AI"
          >
            <Sparkles size={13} className="animate-pulse" />
            ALISSON AI
          </button>
        </div>
      </div>

      <main className="flex-1 min-w-0 w-full flex flex-col relative overflow-hidden">
        {notification && (
          <div
            className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg border ${
              notification.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-red-50 border-red-300 text-red-900"
            }`}
          >
            {notification.msg}
          </div>
        )}

        <div className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
          {viewMode === "grid" ? (
            <DataGrid
              data={data}
              loading={loading}
              error={error}
              columns={columns}
              page={page}
              totalCount={count}
              onNextPage={() => setPage((p) => p + 1)}
              onPrevPage={() => setPage((p) => Math.max(0, p - 1))}
              onRefresh={loadData}
              onActionAttempt={handleActionAttempt}
              tableName={FIXED_TABLE}
              onSearch={handleSearch}
              searchTerm={searchTerm}
            />
          ) : viewMode === "dashboard" ? (
            <Dashboard
              data={dashboardData}
              loading={loading}
              error={error}
              tableName={FIXED_TABLE}
              schema={FIXED_SCHEMA}
              onRefresh={loadData}
              onPromotion={handlePromotionRequest}
            />
          ) : (
            <InventoryTab
              data={dashboardData}
              loading={loading}
              error={error}
              tableName={FIXED_TABLE}
            />
          )}
        </div>
      </main>

      <SecurityModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        onConfirm={executePendingAction}
      />

      <PromotionModal
        isOpen={isPromotionOpen}
        onClose={() => setIsPromotionOpen(false)}
        onConfirm={handlePromotionConfirm}
        selectedItems={selectedForPromo}
        columns={columns}
        loading={promoLoading}
      />

      <AIChat
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        contextData={viewMode === "grid" ? data : dashboardData}
        tableName={FIXED_TABLE}
        schema={FIXED_SCHEMA}
      />
    </div>
  );
}
