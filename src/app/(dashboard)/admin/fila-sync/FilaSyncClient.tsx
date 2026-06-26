"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface FilaItem {
  id: number;
  sistema: string;
  acao: string;
  status: "pendente" | "processando" | "processado" | "falha_definitiva";
  tentativas: number;
  ultimo_erro: string | null;
  proxima_execucao: string | null;
  criado_em: string;
  processado_em: string | null;
  payload_fmt: string | null;
}

interface Contadores {
  pendentes: number;
  processando: number;
  processados: number;
  falhas: number;
}

interface ApiResponse {
  rows: FilaItem[];
  total: number;
  page: number;
  contadores: Contadores;
}

const STATUS_LABELS: Record<FilaItem["status"], string> = {
  pendente: "Pendente",
  processando: "Processando",
  processado: "Processado",
  falha_definitiva: "Falha Definitiva",
};

const STATUS_COLORS: Record<FilaItem["status"], string> = {
  pendente: "bg-yellow-100 text-yellow-800",
  processando: "bg-blue-100 text-blue-800",
  processado: "bg-green-100 text-green-800",
  falha_definitiva: "bg-red-100 text-red-800",
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export default function FilaSyncClient() {
  const [page, setPage] = useState(1);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroSistema, setFiltroSistema] = useState("");
  const [processando, setProcessando] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const queryClient = useQueryClient();

  const params = new URLSearchParams({ page: String(page) });
  if (filtroStatus) params.set("status", filtroStatus);
  if (filtroSistema) params.set("sistema", filtroSistema);

  const { data: dados, isLoading: loading } = useQuery({
    queryKey: ["fila-sync", page, filtroStatus, filtroSistema],
    queryFn: async () => {
      const res = await fetch(`/api/admin/fila-sync?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      return res.json() as Promise<ApiResponse>;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  function exibirMensagem(tipo: "ok" | "erro", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 5000);
  }

  async function handleProcessar() {
    setProcessando(true);
    try {
      const res = await fetch("/api/admin/fila-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limite: 10 }) });
      const data = await res.json() as { processados?: number; falhas?: number; falhas_definitivas?: number; error?: string };
      if (!res.ok) { exibirMensagem("erro", data.error ?? "Erro ao processar"); return; }
      exibirMensagem("ok", `Processados: ${data.processados ?? 0} | Falhas: ${data.falhas ?? 0} | Falhas definitivas: ${data.falhas_definitivas ?? 0}`);
      queryClient.invalidateQueries({ queryKey: ["fila-sync"] });
    } finally {
      setProcessando(false);
    }
  }

  async function handleReprocessar(id: number) {
    const res = await fetch(`/api/admin/fila-sync/${id}/reprocessar`, { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) { exibirMensagem("erro", data.error ?? "Erro ao reprocessar"); return; }
    exibirMensagem("ok", `Item #${id} movido para pendente`);
    queryClient.invalidateQueries({ queryKey: ["fila-sync"] });
  }

  async function handleLimpar() {
    if (!confirm("Deletar todos os registros 'processado' com mais de 30 dias?")) return;
    setLimpando(true);
    try {
      const res = await fetch("/api/admin/fila-sync/limpar", { method: "POST" });
      const data = await res.json() as { deletados?: number; error?: string };
      if (!res.ok) { exibirMensagem("erro", data.error ?? "Erro ao limpar"); return; }
      exibirMensagem("ok", `${data.deletados ?? 0} registro(s) deletado(s)`);
      queryClient.invalidateQueries({ queryKey: ["fila-sync"] });
    } finally {
      setLimpando(false);
    }
  }

  const totalPages = dados ? Math.ceil(dados.total / 50) : 1;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "#1B4332" }}>Fila de Sync Externo</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { void handleProcessar(); }}
            disabled={processando}
            className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: "#1B4332" }}
          >
            {processando ? "Processando..." : "Processar agora"}
          </button>
          <button
            onClick={() => { void handleLimpar(); }}
            disabled={limpando}
            className="px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            {limpando ? "Limpando..." : "Limpar antigos"}
          </button>
        </div>
      </div>

      {mensagem && (
        <div className={`px-4 py-3 rounded text-sm font-medium ${mensagem.tipo === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {mensagem.texto}
        </div>
      )}

      {/* Contadores */}
      {dados?.contadores && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Pendentes", valor: dados.contadores.pendentes, cor: "bg-yellow-50 border-yellow-200" },
            { label: "Processando", valor: dados.contadores.processando, cor: "bg-blue-50 border-blue-200" },
            { label: "Processados", valor: dados.contadores.processados, cor: "bg-green-50 border-green-200" },
            { label: "Falhas Definitivas", valor: dados.contadores.falhas, cor: "bg-red-50 border-red-200" },
          ].map(c => (
            <div key={c.label} className={`rounded-lg border p-4 ${c.cor}`}>
              <div className="text-2xl font-bold">{c.valor}</div>
              <div className="text-sm text-gray-600">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3">
        <select
          value={filtroStatus}
          onChange={e => { setFiltroStatus(e.target.value); setPage(1); }}
          className="border rounded px-3 py-2 text-sm"
          style={{ borderColor: "#1B4332" }}
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="processando">Processando</option>
          <option value="processado">Processado</option>
          <option value="falha_definitiva">Falha Definitiva</option>
        </select>
        <input
          type="text"
          placeholder="Filtrar por sistema..."
          value={filtroSistema}
          onChange={e => { setFiltroSistema(e.target.value); setPage(1); }}
          className="border rounded px-3 py-2 text-sm"
          style={{ borderColor: "#1B4332" }}
        />
        <button
          onClick={() => { queryClient.invalidateQueries({ queryKey: ["fila-sync"] }); }}
          className="px-3 py-2 rounded text-sm font-medium text-white cursor-pointer"
          style={{ backgroundColor: "#1B4332" }}
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "#1B4332" }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "#1B4332", color: "#FAF8F0" }}>
            <tr>
              <th className="px-3 py-3 text-left">ID</th>
              <th className="px-3 py-3 text-left">Sistema</th>
              <th className="px-3 py-3 text-left">Ação</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-center">Tentativas</th>
              <th className="px-3 py-3 text-left">Último Erro</th>
              <th className="px-3 py-3 text-left">Próx. Execução</th>
              <th className="px-3 py-3 text-left">Criado em</th>
              <th className="px-3 py-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados?.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">Nenhum item encontrado</td>
              </tr>
            )}
            {dados?.rows.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : ""} style={{ backgroundColor: idx % 2 !== 0 ? "#FAF8F0" : undefined }}>
                <td className="px-3 py-2 font-mono text-xs">{item.id}</td>
                <td className="px-3 py-2 font-medium">{item.sistema}</td>
                <td className="px-3 py-2 text-gray-600">{item.acao}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">{item.tentativas}</td>
                <td className="px-3 py-2 max-w-xs truncate text-xs text-red-700" title={item.ultimo_erro ?? ""}>
                  {item.ultimo_erro ? item.ultimo_erro.slice(0, 80) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatarData(item.proxima_execucao)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatarData(item.criado_em)}</td>
                <td className="px-3 py-2">
                  {item.status === "falha_definitiva" && (
                    <button
                      onClick={() => { void handleReprocessar(item.id); }}
                      className="px-2 py-1 text-xs rounded text-white cursor-pointer"
                      style={{ backgroundColor: "#1B4332" }}
                    >
                      Reprocessar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40 cursor-pointer"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages} ({dados?.total ?? 0} registros)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40 cursor-pointer"
          >
            Próxima
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400">Auto-refresh a cada 30 segundos</p>
    </div>
  );
}
