"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import type {
  VendasDashboardResponse,
  LeadsDashboardResponse,
  AnalisePerformanceResponse,
  AnaliseFreteResponse,
  AnaliseComissoesResponse,
  RankingConsultora,
} from "@/lib/types/dashboard-comercial";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useApi<T>(url: string, enabled = true): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<T>(url);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (enabled) void fetchData();
  }, [fetchData, enabled]);

  return { data, loading, error, refetch: fetchData };
}

export function useVendasDashboard(from: string, to: string) {
  return useApi<VendasDashboardResponse>(
    `/api/dashboard-comercial/vendas-dashboard?from=${from}&to=${to}`,
  );
}

export function useLeadsDashboard(from: string, to: string) {
  return useApi<LeadsDashboardResponse>(
    `/api/dashboard-comercial/leads?from=${from}&to=${to}`,
  );
}

export function useAnalisePerformance(from: string, to: string, refDate: string) {
  return useApi<AnalisePerformanceResponse>(
    `/api/dashboard-comercial/analise-performance?from=${from}&to=${to}&refDate=${refDate}`,
  );
}

export function useAnaliseFrete(from: string, to: string) {
  return useApi<AnaliseFreteResponse>(
    `/api/dashboard-comercial/analise-frete?from=${from}&to=${to}`,
  );
}

export function useAnaliseComissoes(from: string, to: string) {
  return useApi<AnaliseComissoesResponse>(
    `/api/dashboard-comercial/analise-comissoes?from=${from}&to=${to}`,
  );
}

export function useRanking(from: string, to: string) {
  return useApi<{ ranking: RankingConsultora[] }>(
    `/api/dashboard-comercial/ranking?from=${from}&to=${to}`,
  );
}

export function useComparativoAnual(from: string, to: string) {
  return useApi<{
    faturamento: { atual: number; anterior: number; delta: number; delta_percentual: number };
    quantidade_vendas: { atual: number; anterior: number; delta: number; delta_percentual: number };
    ticket_medio: { atual: number; anterior: number; delta: number; delta_percentual: number };
    periodo: { atual: { from: string; to: string }; anterior: { from: string; to: string } };
  }>(`/api/dashboard-comercial/comparativo-anual?from=${from}&to=${to}`);
}

export function useDateRange() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [from, setFrom] = useState<string>(inicioMes.toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(hoje.toISOString().slice(0, 10));

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const setRange = useCallback((newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  }, []);

  return { from, to, setRange };
}
