"use client";

import { RotateCw, Loader2, Package, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import { useSessao, type JoiaSessao } from "@/hooks/rfid/useSessao";

interface SessaoSidebarProps {
  onReimprimir: (epc: string) => void;
  reimprimindoEpc: string | null;
  disabled?: boolean;
}

function formatarHora(iso: string): string {
  try {
    return format(new Date(iso), "HH:mm:ss");
  } catch {
    return "—";
  }
}

/**
 * Sidebar que exibe as etiquetas impressas na sessão atual.
 *
 * Usa o hook useSessao para buscar as últimas 10 joias cadastradas
 * pelo usuário logado. Inclui opção de reimpressão individual.
 */
export function SessaoSidebar({
  onReimprimir,
  reimprimindoEpc,
  disabled = false,
}: SessaoSidebarProps) {
  const { joias, isLoading } = useSessao();

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Package size={16} />
          Impressas nesta sessão:
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            {joias.length}
          </span>
        </h3>
        <button
          type="button"
          className="text-xs text-gray-400 hover:text-gray-600"
          title="Limpar visualização (não afeta o banco)"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <Spinner size={16} />
            Carregando sessão...
          </div>
        ) : joias.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-400">
            <Package size={28} className="text-gray-200" />
            Nenhuma etiqueta impressa ainda nesta sessão.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {joias.map((item) => (
              <ItemSessao
                key={item.epc}
                item={item}
                onReimprimir={onReimprimir}
                reimprimindo={reimprimindoEpc === item.epc}
                disabled={disabled}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

interface ItemSessaoProps {
  item: JoiaSessao;
  onReimprimir: (epc: string) => void;
  reimprimindo: boolean;
  disabled: boolean;
}

function ItemSessao({ item, onReimprimir, reimprimindo, disabled }: ItemSessaoProps) {
  return (
    <li className="flex items-start gap-2 px-5 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">{formatarHora(item.created_at)}</span>
          <span className="font-mono text-xs font-semibold text-emerald-700">{item.sku}</span>
        </div>
        <p className="truncate text-sm text-gray-700">{item.nome}</p>
        <Badge variant="light" color="neutral" size="sm" className="text-xs">
          {item.epc}
        </Badge>
      </div>

      <button
        type="button"
        onClick={() => onReimprimir(item.epc)}
        disabled={disabled || reimprimindo}
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
        title="Reimprimir etiqueta"
      >
        {reimprimindo ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RotateCw size={14} />
        )}
      </button>
    </li>
  );
}
