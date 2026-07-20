"use client";

import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface JoiaSessao {
  epc: string;
  sku: string;
  nome: string;
  created_at: string;
}

interface SessaoResponse {
  joias: JoiaSessao[];
}

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

async function fetchSessao(): Promise<SessaoResponse> {
  const res = await fetch("/api/rfid/sessao");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Erro ao buscar sessão");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook que busca as últimas 10 joias cadastradas pelo usuário logado
 * na sessão atual (status='ativo').
 *
 * Faz polling a cada 30 segundos. Usado pelo painel lateral
 * "Impressas nesta sessão" da tela de cadastro RFID.
 *
 * Uso típico:
 *   const { joias, isLoading, error } = useSessao();
 */
export function useSessao() {
  const query = useQuery({
    queryKey: ["rfid", "sessao"],
    queryFn: fetchSessao,
    refetchInterval: 30_000, // 30s
    staleTime: 15_000,
  });

  return {
    /** Lista de joias cadastradas nesta sessão. */
    joias: query.data?.joias ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
