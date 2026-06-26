"use client";

/**
 * /site — Gestão da integração com loja virtual (WooCommerce/WordPress).
 *
 * 3 abas:
 *   1. Integração — credenciais da loja (site_url, consumer_key/secret),
 *      teste de conexão, toggle de ativação.
 *   2. Produtos   — lista de produtos do ERP, com toggle "publicar no site"
 *      e status de sincronização por item.
 *   3. Sync       — painel de sincronização (enviar/atualizar/remover do site)
 *      com registro de últimas tentativas.
 *
 * Esta tela é a CAMADA DE UI. Os endpoints de integração com a API
 * WooCommerce REST v3 ficam em /api/site/* e serão preenchidos em outra
 * iteração (hoje a aba já salva/consome a configuração em banco).
 */
import { useEffect, useState } from "react";
import { Globe, Plug, PackageCheck, RefreshCw, Loader2, Check, AlertTriangle, Eye, EyeOff, Save, Upload } from "lucide-react";

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

type Aba = "integracao" | "produtos" | "sync";

interface SiteConfig {
  plataforma: string;
  site_url: string;
  consumer_key: string;
  consumer_secret: string;
  ativo: boolean;
  sincronizar_estoque: boolean;
  sincronizar_preco: boolean;
  ultima_sync_at: string | null;
}

interface SiteProdutoRow {
  produto_id: number;
  sku: string;
  nome: string;
  categoria: string | null;
  preco: number | null;
  saldo: number;
  publicado_no_site: boolean;
  status_sync: "pendente" | "ok" | "erro";
  wc_product_id: number | null;
  wc_permalink: string | null;
  ultimo_erro: string | null;
  ultima_tentativa_at: string | null;
}

export default function SiteClient() {
  const [aba, setAba] = useState<Aba>("integracao");
  const [migPendente, setMigPendente] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  // Estado global da integração — compartilhado entre abas pra banner/toast.
  const [integracaoAtiva, setIntegracaoAtiva] = useState<boolean | null>(null);

  // Detecta se a migration está aplicada + estado da integração.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/site/config");
        const j = await r.json().catch(() => ({}));
        if (cancelado) return;

        if (j?.migracao_pendente) {
          await fetch("/api/site/invalidar-cache", { method: "POST" }).catch(() => null);
          const r2 = await fetch("/api/site/config");
          const j2 = await r2.json().catch(() => ({}));
          if (cancelado) return;
          setMigPendente(!!j2?.migracao_pendente);
          setIntegracaoAtiva(!!j2?.config?.ativo);
        } else {
          setMigPendente(false);
          setIntegracaoAtiva(!!j?.config?.ativo);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelado = true; };
  }, []);

  // Função passada para AbaIntegracao notificar mudanças no "ativo"
  // sem precisar recarregar a página.
  function onAtivoChange(novo: boolean) {
    setIntegracaoAtiva(novo);
  }

  async function revalidarMigration() {
    setRevalidando(true);
    try {
      await fetch("/api/site/invalidar-cache", { method: "POST" });
      const r = await fetch("/api/site/config");
      const j = await r.json().catch(() => ({}));
      setMigPendente(!!j?.migracao_pendente);
    } finally {
      setRevalidando(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.cremeBg }}>
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Banner de migration pendente */}
        {migPendente && (
          <div className="rounded-xl border p-4 flex items-start gap-3" style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A" }}>
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#854D0E" }} />
            <div className="flex-1 text-sm" style={{ color: "#854D0E" }}>
              <p className="font-bold">Migration 159 pendente</p>
              <p className="text-xs mt-1">
                A integração com o site precisa das tabelas <code className="font-mono">alissonerp.site_config</code>,{" "}
                <code className="font-mono">site_produtos</code> e <code className="font-mono">fornecedores</code>.
                Rode no terminal do servidor ERP:
              </p>
              <pre className="mt-2 px-2 py-1.5 bg-white/60 rounded text-[11px] font-mono whitespace-pre-wrap">
                node scripts/apply_159.mjs
              </pre>
              <p className="text-xs mt-1">
                Alternativa: aplique <code className="font-mono">supabase/migrations/159_fornecedor_e_site_wordpress.sql</code> via Supabase Studio → SQL Editor.
              </p>
              <p className="text-xs mt-2">
                Se você já aplicou a migration, o servidor Next.js pode estar com cache.{" "}
                <button
                  onClick={revalidarMigration}
                  disabled={revalidando}
                  className="underline font-semibold disabled:opacity-60"
                >
                  {revalidando ? "Revalidando..." : "Clique aqui para revalidar"}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.esmeralda }}>
              <Globe size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Site — WooCommerce / WordPress</h1>
              <p className="text-xs text-gray-500">Gerencie a integração da loja virtual com o ERP.</p>
            </div>
          </div>
          {/* Badge global do estado da integração */}
          {integracaoAtiva !== null && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: integracaoAtiva ? "#ECFDF5" : "#FEE2E2",
                color:           integracaoAtiva ? "#065F46" : "#991B1B",
                border:          `1px solid ${integracaoAtiva ? "#A7F3D0" : "#FECACA"}`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: integracaoAtiva ? "#059669" : "#DC2626" }}
              />
              {integracaoAtiva ? "Integração ativa" : "Integração desativada"}
            </span>
          )}
        </div>

        {/* Banner de integração desativada */}
        {integracaoAtiva === false && !migPendente && (
          <div className="rounded-xl border p-4 flex items-start gap-3" style={{ backgroundColor: "#FEE2E2", borderColor: "#FECACA" }}>
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#991B1B" }} />
            <div className="flex-1 text-sm" style={{ color: "#991B1B" }}>
              <p className="font-bold">Integração desativada</p>
              <p className="text-xs mt-1">
                Você preencheu as credenciais mas não ativou a integração.
                Envios para o site vão falhar enquanto estiver desativada.
              </p>
              <button
                onClick={() => setAba("integracao")}
                className="mt-2 text-xs font-bold underline hover:no-underline"
              >
                → Ir para Integração e ativar
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: C.cremeBorder }}>
          <TabButton icon={<Plug size={14} />}        label="Integração" active={aba === "integracao"} onClick={() => setAba("integracao")} />
          <TabButton icon={<PackageCheck size={14} />} label="Produtos"   active={aba === "produtos"}   onClick={() => setAba("produtos")} />
          <TabButton icon={<RefreshCw size={14} />}    label="Sincronização" active={aba === "sync"}   onClick={() => setAba("sync")} />
        </div>

        {/* Content */}
        {aba === "integracao" && <AbaIntegracao onAtivoChange={onAtivoChange} />}
        {aba === "produtos"   && <AbaProdutos irParaIntegracao={() => setAba("integracao")} />}
        {aba === "sync"       && <AbaSync />}
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors -mb-px ${
        active ? "text-[#184036]" : "text-gray-500 hover:text-gray-700"
      }`}
      style={{ borderColor: active ? C.esmeralda : "transparent" }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Aba Integração ──────────────────────────────────────────────────────

function AbaIntegracao({ onAtivoChange }: { onAtivoChange?: (v: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testando, setTestando] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [cfg, setCfg] = useState<SiteConfig>({
    plataforma: "woocommerce",
    site_url: "",
    consumer_key: "",
    consumer_secret: "",
    ativo: false,
    sincronizar_estoque: true,
    sincronizar_preco: true,
    ultima_sync_at: null,
  });
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/site/config");
        if (cancelado) return;
        if (r.ok) {
          const j = await r.json();
          if (j?.config) {
            // Merge com updater: só sobrescreve se valor da resposta é não-vazio.
            // Evita que o fetch assíncrono apague o que o usuário digitou enquanto
            // carregava (o `cfg` na closure era stale).
            setCfg((prev) => {
              const merged = { ...prev };
              const c = j.config as Partial<SiteConfig>;
              if (c.plataforma)          merged.plataforma          = c.plataforma;
              if (c.site_url)            merged.site_url            = c.site_url;
              if (c.consumer_key)        merged.consumer_key        = c.consumer_key;
              if (c.consumer_secret)     merged.consumer_secret     = c.consumer_secret;
              if (c.ativo !== undefined) merged.ativo               = !!c.ativo;
              if (c.sincronizar_estoque !== undefined) merged.sincronizar_estoque = !!c.sincronizar_estoque;
              if (c.sincronizar_preco   !== undefined) merged.sincronizar_preco   = !!c.sincronizar_preco;
              if (c.ultima_sync_at)      merged.ultima_sync_at      = c.ultima_sync_at;
              return merged;
            });
          }
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Falha ao salvar");
      setToast({ msg: "Configuração salva com sucesso.", ok: true });
      onAtivoChange?.(cfg.ativo); // notifica o parent
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  }

  async function testarConexao() {
    setTestando(true);
    try {
      const r = await fetch("/api/site/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_url: cfg.site_url,
          consumer_key: cfg.consumer_key,
          consumer_secret: cfg.consumer_secret,
        }),
      });
      const j = await r.json();
      if (j?.ok) {
        setToast({ msg: `✓ Conexão OK — ${j?.store_info ?? "loja respondendo"}`, ok: true });
      } else {
        // Sempre mostra o motivo real + dica de diagnóstico
        const motivo = j?.error ?? `HTTP ${r.status}`;
        setToast({
          msg: `Conexão falhou: ${motivo}${j?.dica ? ` — ${j.dica}` : ""}`,
          ok: false,
        });
      }
    } catch (err) {
      setToast({
        msg: `Erro: ${err instanceof Error ? err.message : "Erro de rede"}`,
        ok: false,
      });
    } finally {
      setTestando(false);
      // Erros ficam visíveis por mais tempo
      setTimeout(() => setToast(null), 12000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-6 space-y-5 max-w-2xl" style={{ borderColor: C.cremeBorder }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Credenciais da loja</h2>
          <p className="text-xs text-gray-500">WooCommerce REST API v3 (chaves criadas em WP-Admin → WooCommerce → Configurações → Avançado → REST API).</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={cfg.ativo}
            onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })}
            className="w-4 h-4 rounded accent-[#184036]"
          />
          Integração ativa
        </label>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500 block mb-1">Plataforma</label>
        <select
          value={cfg.plataforma}
          onChange={(e) => setCfg({ ...cfg, plataforma: e.target.value })}
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none bg-white"
          style={{ borderColor: C.cremeBorder }}
        >
          <option value="woocommerce">WooCommerce (WordPress)</option>
          <option value="wordpress">WordPress (apenas posts/páginas)</option>
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500 block mb-1">URL do site</label>
        <input
          type="url"
          value={cfg.site_url}
          onChange={(e) => setCfg({ ...cfg, site_url: e.target.value })}
          placeholder="https://minhaloja.com.br"
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none font-mono"
          style={{ borderColor: C.cremeBorder }}
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500 block mb-1">Consumer Key</label>
        <input
          type="text"
          value={cfg.consumer_key}
          onChange={(e) => setCfg({ ...cfg, consumer_key: e.target.value })}
          placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none font-mono"
          style={{ borderColor: C.cremeBorder }}
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500 block mb-1">Consumer Secret</label>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={cfg.consumer_secret}
            onChange={(e) => setCfg({ ...cfg, consumer_secret: e.target.value })}
            placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 pr-10 text-sm rounded-lg border outline-none font-mono"
            style={{ borderColor: C.cremeBorder }}
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="border-t pt-4" style={{ borderColor: C.cremeBorder }}>
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Opções de sincronização</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={cfg.sincronizar_estoque}
              onChange={(e) => setCfg({ ...cfg, sincronizar_estoque: e.target.checked })}
              className="w-4 h-4 rounded accent-[#184036]"
            />
            Sincronizar saldo de estoque (ERP → Site)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={cfg.sincronizar_preco}
              onChange={(e) => setCfg({ ...cfg, sincronizar_preco: e.target.checked })}
              className="w-4 h-4 rounded accent-[#184036]"
            />
            Sincronizar preço de venda (curva dinâmica → regular_price)
          </label>
        </div>
      </div>

      {cfg.ultima_sync_at && (
        <p className="text-[11px] text-gray-400 font-mono">
          Última sincronização: {new Date(cfg.ultima_sync_at).toLocaleString("pt-BR")}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={testarConexao}
          disabled={testando || !cfg.site_url || !cfg.consumer_key || !cfg.consumer_secret}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold border flex items-center justify-center gap-2 hover:bg-gray-50 disabled:opacity-40"
          style={{ borderColor: C.esmeralda, color: C.esmeralda }}
        >
          {testando ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
          Testar conexão
        </button>
        <button
          onClick={salvar}
          disabled={saving}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: C.esmeralda }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar configuração
        </button>
      </div>

      {toast && (
        <div
          className="px-3 py-2 rounded-lg text-xs flex items-start gap-2 break-words"
          style={{
            backgroundColor: toast.ok ? "#ECFDF5" : "#FEF2F2",
            color: toast.ok ? "#065F46" : "#991B1B",
            border: `1px solid ${toast.ok ? "#A7F3D0" : "#FECACA"}`,
          }}
        >
          {toast.ok ? <Check size={12} /> : <AlertTriangle size={12} />} {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Aba Produtos ────────────────────────────────────────────────────────

function AbaProdutos({ irParaIntegracao }: { irParaIntegracao?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<SiteProdutoRow[]>([]);
  const [busca, setBusca]       = useState("");
  const [apenasPublicados, setApenasPublicados] = useState(false);
  // Por padrão ligado — na tela de site geralmente só faz sentido listar
  // produtos que têm estoque pra vender.
  const [apenasComEstoque, setApenasComEstoque] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  // IDs dos produtos que estão com sync em andamento (loading no botão)
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set());

  async function carregar() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        busca,
        publicados: String(apenasPublicados),
        com_estoque: String(apenasComEstoque),
      }).toString();
      const r = await fetch(`/api/site/produtos?${qs}`);
      if (r.ok) {
        const j = await r.json();
        setProdutos(Array.isArray(j?.produtos) ? j.produtos : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(carregar, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, apenasPublicados, apenasComEstoque]);

  async function togglePublicado(p: SiteProdutoRow) {
    try {
      const r = await fetch(`/api/site/produtos/${p.produto_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicado_no_site: !p.publicado_no_site }),
      });
      if (!r.ok) throw new Error("Falha");
      setProdutos((curr) =>
        curr.map((x) =>
          x.produto_id === p.produto_id ? { ...x, publicado_no_site: !x.publicado_no_site } : x
        )
      );
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function enviarAgora(p: SiteProdutoRow) {
    setSyncingIds((s) => new Set(s).add(p.produto_id));
    try {
      const r = await fetch(`/api/site/sync/${p.produto_id}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        // Atualiza linha localmente (evita refetch)
        setProdutos((curr) =>
          curr.map((x) =>
            x.produto_id === p.produto_id
              ? {
                  ...x,
                  publicado_no_site: true,
                  status_sync: "ok",
                  wc_product_id: j?.wc_product_id ?? x.wc_product_id,
                  wc_permalink:  j?.wc_permalink  ?? x.wc_permalink,
                  ultimo_erro: null,
                  ultima_tentativa_at: new Date().toISOString(),
                }
              : x
          )
        );
        setToast({ msg: `✓ ${p.nome} enviado ao site`, ok: true });
      } else {
        const motivo = j?.error ?? j?.ultimo_erro ?? "Falha";
        setProdutos((curr) =>
          curr.map((x) =>
            x.produto_id === p.produto_id
              ? { ...x, status_sync: "erro" as const, ultimo_erro: motivo }
              : x
          )
        );
        // Se o erro é configuração (desativada/credenciais), leva pra aba Integração
        if (/desativada|credenciais|Integração/i.test(String(motivo)) && irParaIntegracao) {
          setToast({ msg: `${motivo} — redirecionando para Integração...`, ok: false });
          setTimeout(() => irParaIntegracao(), 1500);
        } else {
          setToast({ msg: `Erro em ${p.sku}: ${motivo}`, ok: false });
        }
      }
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro de rede", ok: false });
    } finally {
      setSyncingIds((s) => {
        const n = new Set(s);
        n.delete(p.produto_id);
        return n;
      });
      setTimeout(() => setToast(null), 6000);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou SKU..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border outline-none bg-white"
          style={{ borderColor: C.cremeBorder }}
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 whitespace-nowrap">
          <input
            type="checkbox"
            checked={apenasPublicados}
            onChange={(e) => setApenasPublicados(e.target.checked)}
            className="w-4 h-4 rounded accent-[#184036]"
          />
          Apenas publicados
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 whitespace-nowrap">
          <input
            type="checkbox"
            checked={apenasComEstoque}
            onChange={(e) => setApenasComEstoque(e.target.checked)}
            className="w-4 h-4 rounded accent-[#184036]"
          />
          Apenas com estoque
        </label>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : produtos.length === 0 ? (
          <div className="text-center py-12 px-6 text-sm">
            <PackageCheck size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="font-semibold text-gray-600 mb-1">Nenhum produto listado</p>
            {busca ? (
              <p className="text-xs text-gray-500">
                Sua busca por <strong>&ldquo;{busca}&rdquo;</strong> não retornou resultados.
              </p>
            ) : apenasComEstoque && apenasPublicados ? (
              <p className="text-xs text-gray-500">
                Nenhum produto publicado tem saldo em estoque ≥ 1.<br />
                Desmarque <strong>&ldquo;Apenas com estoque&rdquo;</strong> ou{" "}
                <strong>&ldquo;Apenas publicados&rdquo;</strong> para ampliar a lista.
              </p>
            ) : apenasComEstoque ? (
              <p className="text-xs text-gray-500">
                Nenhum produto ativo tem saldo em estoque ≥ 1.<br />
                Desmarque <strong>&ldquo;Apenas com estoque&rdquo;</strong> para ver também produtos zerados.
              </p>
            ) : apenasPublicados ? (
              <p className="text-xs text-gray-500">
                Nenhum produto está marcado para publicar no site ainda.<br />
                Desmarque <strong>&ldquo;Apenas publicados&rdquo;</strong> para ver todos os produtos do catálogo
                e marcar quais devem ir para o site.
              </p>
            ) : (
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Não há produtos ativos no catálogo (apenas produtos com{" "}
                <code className="font-mono">situacao = &apos;A&apos;</code>, não-variações, e
                fora de Insumos/Matérias Primas/Mostruário aparecem aqui).
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">SKU</th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Nome</th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Categoria</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Preço</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Estoque</th>
                <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Status Sync</th>
                <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Publicar</th>
                <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500">Ação</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.produto_id} className="border-b last:border-0 hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                  <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{p.sku}</td>
                  <td className="px-3 py-2 text-sm text-gray-800">
                    {p.nome}
                    {p.wc_permalink && (
                      <a href={p.wc_permalink} target="_blank" rel="noopener noreferrer"
                         className="ml-2 text-[10px] text-blue-600 hover:underline">
                        ver no site
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.categoria ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {p.preco != null ? `R$ ${p.preco.toLocaleString("pt-BR")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: p.saldo >= 1 ? "#059669" : "#DC2626" }}>
                    {p.saldo}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={p.status_sync} erro={p.ultimo_erro} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.publicado_no_site}
                        onChange={() => togglePublicado(p)}
                        className="w-4 h-4 accent-[#184036]"
                      />
                    </label>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const loading = syncingIds.has(p.produto_id);
                      const jaSync  = p.status_sync === "ok" && p.wc_product_id;
                      return (
                        <button
                          onClick={() => enviarAgora(p)}
                          disabled={loading}
                          title={jaSync ? "Reenviar (atualiza preço e estoque no WC)" : "Enviar este produto ao site agora"}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: C.esmeralda }}
                        >
                          {loading ? (
                            <>
                              <Loader2 size={11} className="animate-spin" />
                              Enviando
                            </>
                          ) : jaSync ? (
                            <>
                              <RefreshCw size={11} />
                              Reenviar
                            </>
                          ) : (
                            <>
                              <Upload size={11} />
                              Enviar
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div
          className="px-3 py-2 rounded-lg text-xs flex items-start gap-2 break-words"
          style={{
            backgroundColor: toast.ok ? "#ECFDF5" : "#FEF2F2",
            color: toast.ok ? "#065F46" : "#991B1B",
            border: `1px solid ${toast.ok ? "#A7F3D0" : "#FECACA"}`,
          }}
        >
          {toast.ok ? <Check size={12} /> : <AlertTriangle size={12} />} {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, erro }: { status: string; erro: string | null }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ok:       { label: "OK",       bg: "#ECFDF5", color: "#065F46" },
    pendente: { label: "Pendente", bg: "#FEF9C3", color: "#854D0E" },
    erro:     { label: "Erro",     bg: "#FEE2E2", color: "#991B1B" },
  };
  const s = map[status] ?? map.pendente;
  return (
    <span
      title={erro ?? undefined}
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Aba Sync ────────────────────────────────────────────────────────────

function AbaSync() {
  const [sincronizando, setSincronizando] = useState(false);
  const [resumo, setResumo] = useState<{
    total: number; publicados: number; ok: number; pendentes: number; erros: number;
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/site/sync")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.resumo) setResumo(j.resumo); })
      .catch(() => { /* ignore */ });
  }, []);

  async function sincronizarTudo() {
    setSincronizando(true);
    try {
      const r = await fetch("/api/site/sync", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Falha");
      setToast({
        msg: `Sincronizados: ${j?.ok ?? 0} · Erros: ${j?.erros ?? 0}`,
        ok: (j?.erros ?? 0) === 0,
      });
      if (j?.resumo) setResumo(j.resumo);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
    } finally {
      setSincronizando(false);
      setTimeout(() => setToast(null), 5000);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-4" style={{ borderColor: C.cremeBorder }}>
      <h2 className="text-sm font-bold text-gray-800">Sincronização em massa</h2>
      <p className="text-xs text-gray-500">
        Envia preço e estoque de TODOS os produtos marcados como &ldquo;Publicar no site&rdquo; para a loja WooCommerce.
        Produtos novos criam entradas no WP; existentes são atualizados.
      </p>

      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCard label="Total" value={resumo.total} color="#6b7280" />
          <StatCard label="Publicados" value={resumo.publicados} color="#184036" />
          <StatCard label="OK" value={resumo.ok} color="#059669" />
          <StatCard label="Pendentes" value={resumo.pendentes} color="#854D0E" />
          <StatCard label="Erros" value={resumo.erros} color="#991B1B" />
        </div>
      )}

      <button
        onClick={sincronizarTudo}
        disabled={sincronizando}
        className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: C.esmeralda }}
      >
        {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {sincronizando ? "Sincronizando..." : "Sincronizar todos os publicados"}
      </button>

      {toast && (
        <div
          className="px-3 py-2 rounded-lg text-xs flex items-start gap-2 break-words"
          style={{
            backgroundColor: toast.ok ? "#ECFDF5" : "#FEF2F2",
            color: toast.ok ? "#065F46" : "#991B1B",
            border: `1px solid ${toast.ok ? "#A7F3D0" : "#FECACA"}`,
          }}
        >
          {toast.ok ? <Check size={12} /> : <AlertTriangle size={12} />} {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border p-3 text-center" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</p>
      <p className="text-xl font-mono font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}
