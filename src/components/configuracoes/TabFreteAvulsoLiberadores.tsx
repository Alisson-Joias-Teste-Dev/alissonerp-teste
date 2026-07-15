"use client";

/**
 * TabFreteAvulsoLiberadores — Configuração do pool de liberadores de frete avulso.
 *
 * REGRA DE NEGÓCIO (migration 346, modelo POOL): a consultora solicita frete
 * avulso a partir de uma venda própria, mas não escolhe quem libera — qualquer
 * usuário cadastrado aqui como liberador ATIVO (além de admin/desenvolvedor/
 * diretor, que já têm acesso total via isFullAccess) vê e decide qualquer
 * solicitação na aba "Solicitações" de /entregas-venda. Esta tela gerencia
 * essa lista (adicionar/remover).
 *
 * O QUE: espelha a estrutura de fetch/estado de TabAprovadores.tsx — lê
 * GET /api/configuracoes/frete-avulso-liberadores (liberadores ativos +
 * lista aberta de usuários elegíveis), adiciona (POST) e remove (DELETE,
 * soft-delete — mantém histórico).
 *
 * IMPACTO SE REMOVIDO: sem esta tela, a lista de liberadores só pode ser
 * editada por SQL direto no banco.
 */

import { useState, useEffect, useCallback } from "react";
import { Trash2, UserPlus, Bike } from "lucide-react";
import { Spinner, Button } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";

const P = {
  card: "#ffffff",
  border: "#e5e7eb",
  texto: "#111827",
  secundario: "#6b7280",
  vermelho: "#dc2626",
};

interface Liberador {
  userId: string;
  nome: string;
  role: string;
  ativo: boolean;
  createdAt: string;
}

interface UsuarioElegivel {
  id: string;
  nome: string;
  role: string;
}

export default function TabFreteAvulsoLiberadores() {
  const { user, role } = useAuth();
  // REGRA DE NEGÓCIO: só admin/desenvolvedor/diretor gerencia o pool de
  // liberadores — mesma checagem usada pela API (isFullAccess).
  const podeEditar = !!(user && isFullAccess(role));

  const [liberadores, setLiberadores] = useState<Liberador[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioElegivel[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoUserId, setNovoUserId] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ liberadores: Liberador[]; usuarios: UsuarioElegivel[] }>(
        "/api/configuracoes/frete-avulso-liberadores",
      );
      setLiberadores(Array.isArray(data.liberadores) ? data.liberadores : []);
      setUsuarios(Array.isArray(data.usuarios) ? data.usuarios : []);
    } catch (e) {
      useErrorStore.getState().push(
        e instanceof Error ? e.message : "Erro ao carregar liberadores de frete avulso",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const liberadoresAtivos = liberadores.filter((l) => l.ativo);
  // Usuários que ainda não são liberadores ativos (opções do select de adicionar)
  const idsAtivos = new Set(liberadoresAtivos.map((l) => l.userId));
  const usuariosDisponiveis = usuarios.filter((u) => !idsAtivos.has(u.id));

  async function adicionar() {
    if (!novoUserId) return;
    setAdicionando(true);
    try {
      await apiFetch("/api/configuracoes/frete-avulso-liberadores", {
        method: "POST",
        body: JSON.stringify({ userId: novoUserId }),
      });
      setNovoUserId("");
      await carregar();
    } catch (e) {
      useErrorStore.getState().push(
        e instanceof Error ? e.message : "Erro ao adicionar liberador",
      );
    } finally {
      setAdicionando(false);
    }
  }

  async function remover(userId: string) {
    setRemovendoId(userId);
    try {
      await apiFetch(`/api/configuracoes/frete-avulso-liberadores?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      await carregar();
    } catch (e) {
      useErrorStore.getState().push(
        e instanceof Error ? e.message : "Erro ao remover liberador",
      );
    } finally {
      setRemovendoId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium" style={{ color: P.texto }}>
          Liberadores de Frete Avulso (pool)
        </p>
        <p className="text-xs mt-0.5" style={{ color: P.secundario }}>
          {podeEditar
            ? 'Qualquer usuário desta lista vê e decide (libera/recusa) as solicitações de frete avulso da aba "Solicitações", em Entregas de Venda.'
            : "Visualização dos liberadores configurados."}
        </p>
      </div>

      {/* Lista de liberadores ativos */}
      <div className="rounded-lg border" style={{ borderColor: P.border, background: P.card }}>
        {liberadoresAtivos.length === 0 ? (
          <p className="text-sm px-4 py-6 text-center" style={{ color: P.secundario }}>
            Nenhum liberador cadastrado.
          </p>
        ) : (
          liberadoresAtivos.map((l, idx) => (
            <div
              key={l.userId}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: idx > 0 ? `1px solid ${P.border}` : "none" }}
            >
              <div className="flex items-center gap-2">
                <Bike size={14} color={P.secundario} />
                <span className="text-sm font-medium" style={{ color: P.texto }}>{l.nome}</span>
                <span className="text-xs" style={{ color: P.secundario }}>({l.role})</span>
              </div>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => remover(l.userId)}
                  disabled={removendoId === l.userId}
                  className="p-1.5 rounded hover:bg-red-50"
                  style={{ color: P.vermelho, opacity: removendoId === l.userId ? 0.5 : 1 }}
                  aria-label={`Remover ${l.nome}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Adicionar novo liberador — lista ABERTA de usuários ativos (mesmo
          padrão de "lista aberta" já usado em outras configs de aprovador) */}
      {podeEditar && (
        <div className="flex items-center gap-2">
          <select
            value={novoUserId}
            onChange={(e) => setNovoUserId(e.target.value)}
            className="flex-1 text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: P.border, color: P.texto, background: P.card }}
          >
            <option value="">Selecionar usuário...</option>
            {usuariosDisponiveis.map((u) => (
              <option key={u.id} value={u.id}>{u.nome} ({u.role})</option>
            ))}
          </select>
          <Button variant="primary" size="sm" loading={adicionando} disabled={!novoUserId} onClick={adicionar}>
            <UserPlus size={14} /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}
