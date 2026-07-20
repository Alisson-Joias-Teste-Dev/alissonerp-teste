"use client";

import { Tag, X, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { formatPeso, formatMoeda } from "@/lib/formatters";
import type { ProdutoRfid } from "@/lib/rfid/tipos";

interface CardProdutoPreviewProps {
  produto: ProdutoRfid | null;
  carregando: boolean;
  onLimpar: () => void;
}

/**
 * Card de preview do produto selecionado para cadastro de etiqueta RFID.
 *
 * Estados: carregando, vazio (selecione um produto), erro (sem SKU/nome)
 * e sucesso com imagem, SKU, nome, categoria, estoque, peso e preço.
 */
export function CardProdutoPreview({ produto, carregando, onLimpar }: CardProdutoPreviewProps) {
  // Carregando
  if (carregando) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-8">
        <Spinner size={24} className="text-emerald-600" />
        <p className="text-sm text-gray-500">Carregando detalhes...</p>
      </Card>
    );
  }

  // Vazio
  if (!produto) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 px-6 py-10">
        <Tag size={32} className="text-gray-300" />
        <p className="text-sm text-gray-400">Selecione um produto</p>
      </div>
    );
  }

  // Erro: sem SKU ou nome
  if (!produto.tem_sku_e_nome) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800">Produto sem SKU ou nome</p>
            <p className="mt-1 text-sm text-red-600">
              Este produto não possui SKU e/ou nome cadastrados. Corrija no cadastro
              de produtos antes de gerar uma etiqueta RFID.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Sucesso
  return (
    <Card
      className="relative"
      headerRight={
        <Button variant="ghost" size="sm" startIcon={<X size={14} />} onClick={onLimpar}>
          Limpar
        </Button>
      }
    >
      <div className="flex gap-4">
        {/* Imagem ou placeholder */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
          {produto.imagem ? (
            <img
              src={produto.imagem}
              alt={produto.nome ?? "Produto"}
              className="h-full w-full object-cover"
            />
          ) : (
            <Tag size={28} className="text-gray-400" />
          )}
        </div>

        {/* Informações */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* SKU */}
          <p className="font-mono text-lg font-bold text-emerald-700">{produto.sku ?? "—"}</p>

          {/* Nome */}
          <p className="line-clamp-2 text-sm font-medium text-gray-800">
            {produto.nome ?? "—"}
          </p>

          {/* Badges: Categoria + Estoque */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {produto.categoria && (
              <Badge color="neutral" size="sm">
                {produto.categoria}
              </Badge>
            )}
            <Badge color="success" size="sm">
              Estoque: {(produto as any).qtd_estoque ?? 0} un
            </Badge>
          </div>

          {/* Peso + Preço */}
          <div className="flex items-center gap-3 pt-1 text-sm text-gray-600">
            <span>
              Peso:{" "}
              <span className="font-medium text-gray-900">
                {formatPeso(produto.peso_real)}g
              </span>
            </span>
            <span>
              Preço:{" "}
              <span className="font-medium text-gray-900">
                {formatMoeda(produto.preco)}
              </span>
            </span>
          </div>

          {/* ID */}
          <p className="text-xs text-gray-400">id_produto #{produto.id_produto}</p>
        </div>
      </div>
    </Card>
  );
}
