"use client";

import { useState } from "react";
import {
  ArrowLeft, MapPin, Search, Loader2, CheckCircle, AlertTriangle,
  Play, ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Tipos vindos das rotas ────────────────────────────────────────────────────
interface TesteResp {
  produto_id: number;
  sku: string;
  nome: string;
  localizacaoFonte: string | null;
  localizacaoGravada: string | null;
  gravou: boolean;
}

interface Progresso {
  total: number;
  processados: number;
  atualizados: number;
  semLoc: number;
  semCorr: number;
}

export default function ImportarLocalizacaoClient() {
  const router = useRouter();

  // ── Fase 1: teste com 1 peca ──
  const [sku, setSku] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<TesteResp | null>(null);
  const [testeErro, setTesteErro] = useState("");

  // ── Fase 2: migracao completa ──
  const [rodando, setRodando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [prog, setProg] = useState<Progresso | null>(null);
  const [migErro, setMigErro] = useState("");

  async function testarPeca() {
    if (!sku.trim()) return;
    setTestando(true); setTeste(null); setTesteErro("");
    try {
      const r = await fetch("/api/estoque-comercial/importar-localizacao/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: sku.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro ao testar");
      setTeste(d as TesteResp);
    } catch (e) {
      setTesteErro(e instanceof Error ? e.message : "Erro ao testar");
    } finally {
      setTestando(false);
    }
  }

  async function rodarMigracao() {
    const ok = window.confirm(
      "Isso percorre TODAS as peças (~15,6 mil) buscando a localização na fonte e leva alguns minutos. Deixe esta aba aberta. Continuar?",
    );
    if (!ok) return;

    setRodando(true); setConcluido(false); setMigErro("");
    const acc: Progresso = { total: 0, processados: 0, atualizados: 0, semLoc: 0, semCorr: 0 };
    let offset = 0;
    try {
      // Percorre a lista em blocos, acumulando o progresso ate concluir.
      // Cada bloco e uma chamada curta ao back (respeitando o limite da fonte).
      for (let guarda = 0; guarda < 1000; guarda++) {
        const r = await fetch("/api/estoque-comercial/importar-localizacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Erro na importação");

        acc.total = Number(d.totalNaFonte) || acc.total;
        acc.atualizados += Number(d.atualizados) || 0;
        acc.semLoc += Number(d.semLocalizacao) || 0;
        acc.semCorr += Number(d.semCorrespondencia) || 0;
        acc.processados = acc.total > 0 ? Math.min(Number(d.proximoOffset), acc.total) : Number(d.proximoOffset);
        setProg({ ...acc });

        offset = Number(d.proximoOffset);
        if (d.concluido) { setConcluido(true); break; }
      }
    } catch (e) {
      setMigErro(e instanceof Error ? e.message : "Erro na importação");
    } finally {
      setRodando(false);
    }
  }

  const pct = prog && prog.total > 0 ? Math.min(100, Math.round((prog.processados / prog.total) * 100)) : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Voltar */}
      <button
        className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70 transition-opacity"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} /> Estoque Comercial
      </button>

      {/* Titulo */}
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={22} style={{ color: "#184036" }} />
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
          Importar localização das peças
        </h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Traz a localização física que já existe no cadastro das peças. Faça o teste com uma peça
        e, se estiver certo, rode a importação de todas de uma vez.
      </p>

      {/* ── Fase 1: Teste ── */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
            Passo 1
          </span>
          <h2 className="text-base font-semibold" style={{ color: "#184036" }}>Testar com 1 peça</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Digite o SKU de uma peça. O sistema busca a localização dela e grava só essa peça, para você conferir.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1" style={{ minWidth: 200 }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full border rounded-xl pl-8 pr-3 py-2 text-sm outline-none font-mono"
              style={{ borderColor: "#E8DCC8" }}
              placeholder="SKU (ex: AJ4607)"
              value={sku}
              onChange={e => setSku(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") testarPeca(); }}
              disabled={testando}
            />
          </div>
          <button
            onClick={testarPeca}
            disabled={testando || !sku.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: "#184036", color: "#fff" }}
          >
            {testando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar e gravar
          </button>
        </div>

        {testeErro && (
          <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: "#DC2626" }}>
            <AlertTriangle size={15} /> {testeErro}
          </div>
        )}

        {teste && (
          <div className="mt-4 rounded-xl p-4 bg-white" style={{ border: "1px solid #E8DCC8" }}>
            <p className="text-sm font-medium" style={{ color: "#184036" }}>{teste.nome}</p>
            <p className="text-xs text-gray-400 mb-3 font-mono">{teste.sku}</p>
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="text-gray-500">Localização encontrada:</span>
              {teste.localizacaoGravada ? (
                <span className="font-mono px-2 py-0.5 rounded" style={{ background: "#D1FAE5", color: "#065F46" }}>
                  {teste.localizacaoGravada}
                </span>
              ) : (
                <span className="text-gray-400">— vazia na origem (nada a gravar)</span>
              )}
            </div>
            <button
              onClick={() => router.push(`/estoque-comercial/${teste.produto_id}`)}
              className="flex items-center gap-1.5 text-sm hover:underline"
              style={{ color: "#184036" }}
            >
              <ExternalLink size={14} /> Ver a peça no estoque
            </button>
          </div>
        )}
      </div>

      {/* ── Fase 2: Migracao ── */}
      <div className="rounded-2xl p-5" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>
            Passo 2
          </span>
          <h2 className="text-base font-semibold" style={{ color: "#184036" }}>Importar todas as peças</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Percorre todas as peças e grava a localização de cada uma. Leva alguns minutos — deixe esta aba aberta.
          É seguro rodar de novo: só preenche a localização, não mexe em estoque.
        </p>

        {!rodando && !concluido && (
          <button
            onClick={rodarMigracao}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "#184036", color: "#fff" }}
          >
            <Play size={15} /> Importar localização de todas as peças
          </button>
        )}

        {(rodando || prog) && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-1.5" style={{ color: "#184036" }}>
                {rodando && <Loader2 size={14} className="animate-spin" />}
                {concluido ? "Concluído" : rodando ? "Importando…" : "Parado"}
              </span>
              <span className="text-gray-500">
                {prog ? `${prog.processados.toLocaleString("pt-BR")} / ${(prog.total || 0).toLocaleString("pt-BR")}` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E8DCC8" }}>
              <div className="h-full transition-all" style={{ width: `${concluido ? 100 : pct}%`, background: "#184036" }} />
            </div>

            {prog && (
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="rounded-xl p-3 bg-white" style={{ border: "1px solid #E8DCC8" }}>
                  <p className="text-xs text-gray-500">Com localização</p>
                  <p className="text-xl font-bold" style={{ color: "#059669" }}>{prog.atualizados.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-xl p-3 bg-white" style={{ border: "1px solid #E8DCC8" }}>
                  <p className="text-xs text-gray-500">Vazias na origem</p>
                  <p className="text-xl font-bold text-gray-500">{prog.semLoc.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-xl p-3 bg-white" style={{ border: "1px solid #E8DCC8" }}>
                  <p className="text-xs text-gray-500">Sem cadastro no ERP</p>
                  <p className="text-xl font-bold text-gray-500">{prog.semCorr.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {concluido && (
          <div className="flex items-center gap-2 mt-4 text-sm font-medium" style={{ color: "#065F46" }}>
            <CheckCircle size={16} /> Importação concluída. As localizações já aparecem na lista do estoque.
          </div>
        )}

        {migErro && (
          <div className="flex items-center gap-2 mt-4 text-sm" style={{ color: "#DC2626" }}>
            <AlertTriangle size={15} /> {migErro} — dá para rodar de novo; ele continua do ponto que faltava.
          </div>
        )}
      </div>
    </div>
  );
}
