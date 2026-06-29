"use client";

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Loader2, Save, ChevronDown, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";
import { Button } from "@/components/ui/Button";

const ITENS_POR_PAGINA = 6;

interface AprovadorConfig { aprovador_credito_diretor: string; aprovador_desconto_padrao: string; aprovador_cartao_desconto_padrao: string; aprovadora_credito_gerente?: string; aprovador_compra_comercial?: string; metal_aprovador_id?: string; aprovador_limpeza?: string; aprovador_entrega_sem_pagamento?: string; aprovador_devolucao_fora_prazo?: string; aprovador_devolucao_estoque?: string; aprovador_vale_troca_excecao?: string; aprovadores_devolver_peca?: string; }
interface Usuario { id: string; nome: string; role?: string; }
interface UsuariosPorRole { gerentes: Usuario[]; diretores_admins: Usuario[]; admins_devs: Usuario[]; metal_aprovadores: Usuario[]; aprovadores_limpeza: Usuario[]; aprovadores_entrega_sem_pagamento: Usuario[]; todos_usuarios: Usuario[]; }

const CONFIG_ITENS = [
  { chave: "aprovadora_credito_gerente" as const, titulo: "Crédito A Receber (dentro do saldo)", descricao: "Aprova crédito quando o valor está dentro do saldo do gerente", usuariosKey: "gerentes" as const },
  { chave: "aprovador_credito_diretor" as const, titulo: "Crédito A Receber (acima do saldo)", descricao: "Aprova crédito quando o valor excede o saldo", usuariosKey: "diretores_admins" as const },
  { chave: "aprovador_desconto_padrao" as const, titulo: "Desconto acima do limite", descricao: "Aprova descontos que ultrapassam o percentual permitido", usuariosKey: "admins_devs" as const },
  { chave: "aprovador_cartao_desconto_padrao" as const, titulo: "Cartão de crédito com desconto >20%", descricao: "Aprova pagamento no cartão com desconto acima de 20%", usuariosKey: "admins_devs" as const },
  { chave: "aprovador_compra_comercial" as const, titulo: "Compra Comercial", descricao: "Aprova ordens de compra comercial", usuariosKey: "admins_devs" as const },
  { chave: "metal_aprovador_id" as const, titulo: "Compra de Metal acima do teto", descricao: "Aprova compras de metal quando ultrapassa o teto", usuariosKey: "metal_aprovadores" as const },
  { chave: "aprovador_limpeza" as const, titulo: "Limpeza de Metal (Sangria)", descricao: "Aprova a limpeza do metal antes de entrar no estoque", usuariosKey: "aprovadores_limpeza" as const },
  { chave: "aprovador_entrega_sem_pagamento" as const, titulo: "Entrega sem pagamento total", descricao: "Aprova marcar pedido como entregue mesmo com saldo aberto", usuariosKey: "aprovadores_entrega_sem_pagamento" as const },
  { chave: "aprovador_devolucao_fora_prazo" as const, titulo: "Devolução fora do prazo (7 dias úteis)", descricao: "Aprova gerar vale-troca quando a venda passou de 7 dias", usuariosKey: "todos_usuarios" as const },
  { chave: "aprovador_devolucao_estoque" as const, titulo: "Devolução — aprovação do estoque", descricao: "Confere o estoque da devolução antes de gerar o vale", usuariosKey: "todos_usuarios" as const },
  { chave: "aprovador_vale_troca_excecao" as const, titulo: "Vale-troca — exceção (WhatsApp indisponível)", descricao: "Libera aplicar o vale quando não dá pra confirmar pelo WhatsApp", usuariosKey: "todos_usuarios" as const },
  { chave: "aprovadores_devolver_peca" as const, titulo: "Devolução de peça — venda virou crédito", descricao: "Quem confirma a recolocação da peça no estoque. Pode marcar vários.", usuariosKey: "todos_usuarios" as const, multi: true },
];

export default function TabAprovadores() {
  const { user, role } = useAuth();
  const podeEditar = !!(user && isFullAccess(role));
  const [config, setConfig] = useState<AprovadorConfig>({ aprovador_credito_diretor: "", aprovador_desconto_padrao: "", aprovador_cartao_desconto_padrao: "", aprovadora_credito_gerente: "", aprovador_compra_comercial: "", metal_aprovador_id: "", aprovador_limpeza: "", aprovador_entrega_sem_pagamento: "", aprovador_devolucao_fora_prazo: "", aprovador_devolucao_estoque: "", aprovador_vale_troca_excecao: "", aprovadores_devolver_peca: "" });
  const [usuarios, setUsuarios] = useState<UsuariosPorRole>({ gerentes: [], diretores_admins: [], admins_devs: [], metal_aprovadores: [], aprovadores_limpeza: [], aprovadores_entrega_sem_pagamento: [], todos_usuarios: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    fetch("/api/configuracoes/aprovadores").then(r => r.json()).then(d => {
      setConfig({ aprovador_credito_diretor: d.aprovador_credito_diretor ?? "", aprovador_desconto_padrao: d.aprovador_desconto_padrao ?? "", aprovador_cartao_desconto_padrao: d.aprovador_cartao_desconto_padrao ?? "", aprovadora_credito_gerente: d.aprovadora_credito_gerente ?? "", aprovador_compra_comercial: d.aprovador_compra_comercial ?? "", metal_aprovador_id: d.metal_aprovador_id ?? "", aprovador_limpeza: d.aprovador_limpeza ?? "", aprovador_entrega_sem_pagamento: d.aprovador_entrega_sem_pagamento ?? "", aprovador_devolucao_fora_prazo: d.aprovador_devolucao_fora_prazo ?? "", aprovador_devolucao_estoque: d.aprovador_devolucao_estoque ?? "", aprovador_vale_troca_excecao: d.aprovador_vale_troca_excecao ?? "", aprovadores_devolver_peca: d.aprovadores_devolver_peca ?? "" });
      setUsuarios(d.usuarios ?? { gerentes: [], diretores_admins: [], admins_devs: [], metal_aprovadores: [], aprovadores_limpeza: [], aprovadores_entrega_sem_pagamento: [], todos_usuarios: [] });
    }).finally(() => setLoading(false));
  }, []);

  function onChange(chave: string, valor: string) { setConfig(prev => ({ ...prev, [chave]: valor })); setSaved(false); }

  function toggleMulti(chave: string, userId: string) {
    setConfig(prev => { const atual = String((prev as any)[chave] ?? "").split(",").map(s => s.trim()).filter(Boolean); const novo = atual.includes(userId) ? atual.filter(x => x !== userId) : [...atual, userId]; return { ...prev, [chave]: novo.join(",") }; });
    setSaved(false);
  }

  function getMultiNames(chave: string): string {
    const ids = new Set(String((config as any)[chave] ?? "").split(",").map(s => s.trim()).filter(Boolean));
    if (ids.size === 0) return "";
    return usuarios.todos_usuarios.filter(u => ids.has(u.id)).map(u => u.nome).join(", ");
  }

  function getUserName(chave: string): string {
    const id = (config as any)[chave]; if (!id) return "";
    const all = [...usuarios.gerentes, ...usuarios.diretores_admins, ...usuarios.admins_devs, ...usuarios.metal_aprovadores, ...usuarios.aprovadores_limpeza, ...usuarios.aprovadores_entrega_sem_pagamento, ...usuarios.todos_usuarios];
    return all.find(x => x.id === id)?.nome ?? "";
  }

  function getMultiCount(chave: string): number { return String((config as any)[chave] ?? "").split(",").map(s => s.trim()).filter(Boolean).length; }

  async function salvar() { setSaving(true); try { await fetch("/api/configuracoes/aprovadores", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }); setSaved(true); toast.success("Aprovadores salvos"); setTimeout(() => setSaved(false), 2500); } finally { setSaving(false); } }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  const selectCls = "h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 pr-10 text-sm shadow-theme-xs outline-none focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 text-gray-900 cursor-pointer bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat";
  const displayCls = "h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700 flex items-center";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Filtrar por tipo de aprovação..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
        </div>
        <Button size="sm" onClick={salvar} loading={saving} startIcon={saved ? undefined : <Save size={14} />}>{saved ? "Salvo" : "Salvar"}</Button>
      </div>

      {(() => {
        const filtrados = CONFIG_ITENS.filter(item => !search.trim() || item.titulo.toLowerCase().includes(search.toLowerCase()) || item.descricao.toLowerCase().includes(search.toLowerCase()));
        const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
        const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);
        return (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paginados.map(item => {
          const valorAtual = (config as any)[item.chave] ?? "";
          const lista = usuarios[item.usuariosKey] ?? [];
          const isMulti = (item as { multi?: boolean }).multi;
          const isOpen = dropdownOpen === item.chave;
          const multiCount = getMultiCount(item.chave);

          return (
            <div key={item.chave} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 flex flex-col">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-gray-800">{item.titulo}</p>
                <p className="text-xs text-gray-500">{item.descricao}</p>
              </div>

              {isMulti ? (
                podeEditar ? (
                  <div className="relative">
                    <button type="button" onClick={() => setDropdownOpen(isOpen ? null : item.chave)}
                      className="h-11 w-full flex items-center justify-between rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm shadow-theme-xs hover:bg-gray-50 transition-colors">
                      <span className={`${multiCount > 0 ? "text-gray-900" : "text-gray-400"}`}>
                        {multiCount > 0 ? `${multiCount} selecionado(s)` : "— Selecione —"}
                      </span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(null)} />
                        <div className="absolute z-20 bottom-full mb-1 left-0 right-0 rounded-xl border border-gray-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                          {lista.map(u => {
                            const sel = String(valorAtual).split(",").map(s => s.trim()).includes(u.id);
                            return (
                              <button key={u.id} type="button" onClick={() => toggleMulti(item.chave, u.id)}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-left transition-colors hover:bg-gray-50">
                                <input type="checkbox" checked={sel} readOnly
                                  className="h-4 w-4 rounded border-gray-300 text-esmeralda-600 focus:ring-esmeralda-500" />
                                <span className="text-gray-900">{u.nome}{u.role ? ` (${u.role})` : ""}</span>
                              </button>
                            );
                          })}
                          {lista.length === 0 && <div className="px-3.5 py-3 text-sm text-gray-400">Nenhum usuário disponível</div>}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className={displayCls}>{getMultiNames(item.chave) || "— Nenhum aprovador configurado —"}</div>
                )
              ) : podeEditar ? (
                <select value={valorAtual} onChange={e => onChange(item.chave, e.target.value)} className={selectCls}>
                  <option value="">— Selecione um aprovador —</option>
                  {lista.map(u => <option key={u.id} value={u.id}>{u.nome}{u.role ? ` (${u.role})` : ""}</option>)}
                </select>
              ) : (
                <div className={displayCls}>{getUserName(item.chave) || "— Nenhum aprovador configurado —"}</div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtrados.length} itens)</p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? "bg-esmeralda-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{p}</button>
            ))}
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próximo</Button>
          </div>
        </div>
      )}
      </>
      );
      })()}

      <p className="text-xs text-gray-400">
        {podeEditar ? "As alterações são aplicadas imediatamente." : "Só administradores podem alterar essas configurações."}
      </p>
    </div>
  );
}
