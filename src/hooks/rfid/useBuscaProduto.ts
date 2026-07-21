"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProdutoRfid } from "@/lib/rfid/tipos";

// ---------------------------------------------------------------------------
// Tipos de resposta da API
// ---------------------------------------------------------------------------

export interface CategoriaDisponivel {
  base: string;
  total: number;
}

interface CategoriasResponse {
  total_geral: number;
  categorias: CategoriaDisponivel[];
}

export interface ProdutoPreview {
  id_produto: number;
  sku: string | null;
  nome: string | null;
  categoria: string | null;
  peso_real: number | null;
  peso_precificado: number | null;
  preco: number | null;
  imagem: string | null;
  tem_sku_e_nome: boolean;
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

async function fetchCategorias(): Promise<CategoriasResponse> {
  const res = await fetch("/api/rfid/categorias-disponiveis");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Erro ao buscar categorias");
  }
  return res.json();
}

async function fetchProdutos(
  categoriaBase: string | null,
  query: string,
  limit = 20,
): Promise<ProdutoRfid[]> {
  const params = new URLSearchParams();
  if (categoriaBase) params.set("categoria_base", categoriaBase);
  if (query.length >= 2) params.set("q", query);
  params.set("limit", String(limit));

  const res = await fetch(`/api/rfid/produtos-disponiveis?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Erro ao buscar produtos");
  }
  return res.json();
}

async function fetchProdutoPreview(id: number): Promise<ProdutoPreview> {
  const res = await fetch(`/api/rfid/produto-preview?id=${id}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Erro ao buscar preview do produto");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Parâmetros reutilizáveis
// ---------------------------------------------------------------------------

export interface UseBuscaProdutoParams {
  /** Categoria base selecionada (ex.: "Anel"), ou null para todas. */
  categoriaBase: string | null;

  /** Texto de busca digitado pelo usuário (SKU ou nome). */
  query: string;

  /** ID do produto para preview detalhado, ou null. */
  previewId: number | null;

  /** Limite de produtos na listagem (default 20). */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook consolidado de busca de produtos na tela de cadastro RFID.
 *
 * Expõe três queries independentes:
 *   - categorias: lista de categorias base com contagem (disponíveis p/ filtro)
 *   - produtos:   listagem paginada, filtrada por categoria e/ou texto
 *   - preview:    card detalhado de um único produto pré-selecionado
 *
 * Uso típico:
 *   const { categorias, produtos, preview } = useBuscaProduto({
 *     categoriaBase: "Anel",
 *     query: "1470",
 *     previewId: 123,
 *   });
 */
export function useBuscaProduto(params: UseBuscaProdutoParams) {
  const { categoriaBase, query, previewId, limit = 20 } = params;

  // ---- Categorias (sempre habilitado) ----
  const categoriasQuery = useQuery({
    queryKey: ["rfid", "categorias"],
    queryFn: fetchCategorias,
    staleTime: 60_000, // 1 min — categorias mudam pouco
  });

  // ---- Produtos (habilitado apenas com filtro válido) ----
  const enabledProdutos =
    (query.length >= 2 || categoriaBase !== null);

  const produtosQuery = useQuery({
    queryKey: ["rfid", "produtos", { categoriaBase, query }],
    queryFn: () => fetchProdutos(categoriaBase, query, limit),
    enabled: enabledProdutos,
    staleTime: 30_000, // 30s — estoque pode mudar
    placeholderData: (prev) => prev, // Mantém dados anteriores enquanto recarrega
  });

  // ---- Preview (habilitado apenas quando ID é informado) ----
  const previewQuery = useQuery({
    queryKey: ["rfid", "produto-preview", previewId],
    queryFn: () => fetchProdutoPreview(previewId!),
    enabled: previewId !== null,
    staleTime: 60_000,
  });

  return {
    /** Lista de categorias base com contagem. */
    categorias: categoriasQuery.data?.categorias ?? [],
    totalGeral: categoriasQuery.data?.total_geral ?? 0,
    isCategoriasLoading: categoriasQuery.isLoading,
    categoriasError: categoriasQuery.error,

    /** Lista de produtos filtrados. */
    produtos: produtosQuery.data ?? [],
    isProdutosLoading: produtosQuery.isLoading,
    isProdutosFetching: produtosQuery.isFetching,
    produtosError: produtosQuery.error,

    /** Preview detalhado do produto selecionado. */
    preview: previewQuery.data ?? null,
    isPreviewLoading: previewQuery.isLoading,
    previewError: previewQuery.error,

    /** Combinação: alguma query está carregando? */
    isLoading: categoriasQuery.isLoading || previewQuery.isLoading,
  };
}
