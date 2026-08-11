"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Globe, Store, MessageCircle, ShoppingBag, Building2, CreditCard, Coins, Bot, ExternalLink, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { InputField } from "@/components/ui/InputField";
import { Switch } from "@/components/ui/Switch";

const INFOS: { id: string; name: string; description: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "woocommerce", name: "WooCommerce", description: "Sincroniza produtos e pedidos com a loja virtual", icon: ShoppingBag },
  { id: "kommo", name: "Kommo", description: "CRM de vendas — integração de leads e contatos", icon: MessageCircle },
  { id: "tiny", name: "Tiny ERP", description: "Sistema de gestão empresarial — produtos e estoque", icon: Store },
  { id: "open_exchange", name: "Open Exchange Rates", description: "API de cotações de moedas para atualização automática", icon: Coins },
  { id: "mercado_pago", name: "Mercado Pago", description: "Gateway de pagamento — PIX, cartão e maquininhas", icon: CreditCard },
  { id: "pagbank", name: "PagBank", description: "Gateway de pagamento — PIX, cartão e links", icon: Building2 },
  { id: "banco_inter", name: "Banco Inter", description: "Conciliação bancária e extrato automático", icon: Globe },
  { id: "ia_providers", name: "Provedores de IA", description: "Claude, OpenAI e Gemini para validação de peso", icon: Bot },
];

export default function TabIntegracoes() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});

  // Edit modal state
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [editVisible, setEditVisible] = useState<Record<string, boolean>>({});
  const [editAtivo, setEditAtivo] = useState(true);
  const [editErro, setEditErro] = useState("");

  // Tiny ERP usa OAuth2 (não basta salvar client_id/secret — precisa autorizar
  // via redirect). tinyConectado = já tem bearer_token (conectado de fato);
  // "Configurado" no card genérico só indica credenciais salvas.
  // IMPACTO SE REMOVIDO: perde o botão de conectar/reconectar e o de reenviar
  // vendas que ficaram em fila_sync_externo por erro de sincronização.
  const [tinyConectado, setTinyConectado] = useState(false);
  const [retryingAllTiny, setRetryingAllTiny] = useState(false);
  const [retryAllMsg, setRetryAllMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // ── Carregar dados ──
  async function carregarTudo() {
    setLoading(true);
    try {
      const [rawData, rawIa] = await Promise.all([
        fetch("/api/configuracoes/integracoes").then(r => r.ok ? r.json() : {}),
        fetch("/api/configuracoes/ia").then(r => r.ok ? r.json() : { keys_status: {} }),
      ]);
      const data = rawData as Record<string, unknown>;
      const iaData = rawIa as Record<string, unknown>;
      const status: Record<string, boolean> = {};
      status.woocommerce = !!(data.woo_url && data.woo_key);
      status.kommo = !!(data.kommo_url && data.kommo_token);
      // tiny_has_credentials = client_id/secret salvos; tiny_configured = OAuth
      // concluído (tem bearer_token) — o card mostra "Configurado" já com as
      // credenciais salvas, mas o botão de conectar (abaixo) depende do 2º.
      status.tiny = !!data.tiny_has_credentials;
      status.open_exchange = !!data.open_exchange_api_key_configured;
      status.mercado_pago = !!(data.mp_access_token);
      status.pagbank = !!(data.pagbank_connect_token);
      status.banco_inter = !!data.inter_configured;
      setTinyConectado(!!data.tiny_configured);
      const ks = (iaData as unknown as { keys_status?: Record<string, boolean> }).keys_status || {};
      status.ia_providers = Object.values(ks).some(Boolean);
      setConfigured(status);
    } catch { /* silencioso */ }
    setLoading(false);
  }
  useEffect(() => { carregarTudo(); }, []);

  // ── Carregar campos existentes quando abrir modal ──
  useEffect(() => {
    if (!editId) return;
    if (editId === "ia_providers") {
      fetch("/api/configuracoes/ia").then(r => r.json()).then(data => {
        setEditData(prev => ({ ...prev, ia_provedor: data.config?.ia_provedor || "claude" }));
      }).catch(() => {});
      return;
    }
    fetch("/api/configuracoes/integracoes").then(r => r.json()).then(data => {
      const initial: Record<string, string> = {};
      for (const key of Object.keys(data)) {
        if (typeof data[key] === "string" && data[key]) initial[key] = data[key];
      }
      setEditData(prev => ({ ...initial, ...prev }));
      // Carregar estado ativo da integração
      const ativoKey = `${editId.replace("open_exchange", "open_exchange").replace("woocommerce", "woo").replace("mercado_pago", "mp").replace("pagbank", "pagbank").replace("banco_inter", "inter")}_ativo`;
      if (data[ativoKey] !== undefined) setEditAtivo(data[ativoKey]);
      else setEditAtivo(true);
    }).catch(() => {});
  }, [editId]);

  // ── Abrir modal de edição ──
  function abrirEdicao(id: string) { setEditId(id); setEditData({}); setEditVisible({}); setEditAtivo(true); setEditErro(""); setRetryAllMsg(null); }
  function fecharEdicao() { setEditId(null); setEditData({}); setEditVisible({}); setEditErro(""); }

  // Gera um segredo aleatório pro campo Cron Secret do Banco Inter — o usuário
  // não precisa inventar/lembrar uma string forte na mão.
  function gerarCronSecret() {
    const secret = Array.from({ length: 32 }, () => Math.random().toString(36).charAt(2)).join("");
    setEditData(prev => ({ ...prev, inter_cron_secret: secret }));
  }

  // Reenvia ao Tiny as vendas que ficaram presas em fila_sync_externo por erro
  // de sincronização (ex.: instabilidade da API do Tiny). Não bloqueia a venda
  // em si — só tenta de novo o espelhamento pro ERP externo.
  async function reenviarPendentesTiny() {
    setRetryingAllTiny(true); setRetryAllMsg(null);
    try {
      const res = await fetch("/api/tiny/resync-erros", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.total === 0) setRetryAllMsg({ tipo: "ok", texto: "Nenhuma venda com erro para reenviar." });
        else setRetryAllMsg({ tipo: d.erros === 0 ? "ok" : "erro", texto: `${d.sincronizados}/${d.total} reenviados.${d.erros > 0 ? ` ${d.erros} falharam.` : ""}` });
      } else {
        setRetryAllMsg({ tipo: "erro", texto: d.error ?? "Erro ao reenviar" });
      }
    } catch {
      setRetryAllMsg({ tipo: "erro", texto: "Erro de rede" });
    } finally {
      setRetryingAllTiny(false);
    }
  }

  // ── Campos de cada integração ──
  function renderFields() {
    if (!editId) return null;
    const v = editData;
    const vs = editVisible;

    const fields: { key: string; label: string; secret?: boolean; placeholder?: string }[] = [];
    switch (editId) {
      case "woocommerce":
        fields.push({ key: "woo_url", label: "URL da Loja", placeholder: "https://minhaloja.com" });
        fields.push({ key: "woo_key", label: "Consumer Key", secret: true });
        fields.push({ key: "woo_secret", label: "Consumer Secret", secret: true });
        break;
      case "kommo":
        fields.push({ key: "kommo_url", label: "URL do Kommo", placeholder: "https://seudominio.kommo.com" });
        fields.push({ key: "kommo_token", label: "Token de Acesso", secret: true });
        break;
      case "tiny":
        fields.push({ key: "tiny_client_id", label: "Client ID" });
        fields.push({ key: "tiny_client_secret", label: "Client Secret", secret: true });
        break;
      case "open_exchange":
        fields.push({ key: "open_exchange_api_key", label: "API Key", secret: true, placeholder: "Cole sua API key aqui" });
        break;
      case "mercado_pago":
        fields.push({ key: "mp_access_token", label: "Access Token", secret: true });
        fields.push({ key: "mp_webhook_secret", label: "Webhook Secret", secret: true });
        fields.push({ key: "mp_user_id", label: "User ID" });
        break;
      case "pagbank":
        fields.push({ key: "pagbank_connect_token", label: "Connect Token", secret: true });
        fields.push({ key: "pagbank_webhook_secret", label: "Webhook Secret", secret: true });
        fields.push({ key: "pagbank_user_id", label: "User ID" });
        break;
      case "banco_inter":
        fields.push({ key: "inter_client_id", label: "Client ID" });
        fields.push({ key: "inter_client_secret", label: "Client Secret", secret: true });
        fields.push({ key: "inter_cert_pem", label: "Certificado PEM", secret: true });
        fields.push({ key: "inter_key_pem", label: "Chave PEM", secret: true });
        fields.push({ key: "inter_conta_corrente", label: "Conta Corrente" });
        // Segredo que o webhook/cron do Inter usa para autenticar a chamada de
        // conciliação automática — sem ele configurado, o job de extrato roda
        // sem autenticação (ou não roda, dependendo do endpoint).
        fields.push({ key: "inter_cron_secret", label: "Cron Secret (segredo p/ webhook)", secret: true, placeholder: "Gere ou cole um segredo" });
        break;
      case "ia_providers":
        fields.push({ key: "ia_provedor", label: "Provedor", placeholder: "claude / openai / gemini" });
        fields.push({ key: "ia_api_key", label: "API Key", secret: true, placeholder: "Cole a API key do provedor" });
        break;
    }

    return fields.map(f => (
      <InputField key={f.key}
        label={f.label}
        placeholder={f.placeholder ?? ""}
        type={f.secret ? "password" : "text"}
        value={v[f.key] ?? ""}
        visible={vs[f.key]}
        onVisibleChange={f.secret ? () => setEditVisible(prev => ({ ...prev, [f.key]: !prev[f.key] })) : undefined}
        onChange={e => setEditData(prev => ({ ...prev, [f.key]: e.target.value }))}
      />
    ));
  }

  // ── Salvar ──
  async function handleSave() {
    if (!editId) return;
    setSaving(true); setEditErro("");
    try {
      const payload: Record<string, string | boolean> = {};
      if (editId) {
        const ativoMap: Record<string, string> = { woocommerce: "woo_ativo", kommo: "kommo_ativo", tiny: "tiny_ativo", open_exchange: "auto_ativo", mercado_pago: "mp_ativo", pagbank: "pagbank_ativo", banco_inter: "inter_ativo" };
        payload[ativoMap[editId] ?? `${editId}_ativo`] = editAtivo;
      }
      for (const [key, val] of Object.entries(editData)) {
        if (val) payload[key] = val;
      }
      if (editId === "ia_providers") {
        const res = await fetch("/api/configuracoes/ia/key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provedor: editData.ia_provedor, api_key: editData.ia_api_key }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Erro ao salvar key"); }
      } else {
        const res = await fetch("/api/configuracoes/integracoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Erro ao salvar"); }
      }
      toast.success(`${INFOS.find(i => i.id === editId)?.name} salvo com sucesso`);
      fecharEdicao();
      carregarTudo();
    } catch (e) {
      setEditErro(e instanceof Error ? e.message : "Erro");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {INFOS.map(({ id, name, description, icon: Icon }) => {
          const conf = configured[id];
          return (
            <div key={id} className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 shrink-0">
                  <Icon size={20} className="text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">{name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                <Badge color={conf ? "success" : "neutral"} size="sm">{conf ? "Configurado" : "Pendente"}</Badge>
                <button onClick={() => abrirEdicao(id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <Pencil size={12} />
                  {conf ? "Editar" : "Configurar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={!!editId} onClose={fecharEdicao}
        title={editId ? INFOS.find(i => i.id === editId)?.name ?? "Editar" : "Editar"}
        description="Configure as credenciais de acesso à API"
        size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Ativar integração</p>
              <p className="text-xs text-gray-500 mt-0.5">Quando desativada, o sistema ignora esta integração</p>
            </div>
            <Switch checked={editAtivo} onChange={setEditAtivo} color="brand" />
          </div>
          {renderFields?.()}

          {/* Banco Inter: gerar o Cron Secret em 1 clique em vez de digitar na mão. */}
          {editId === "banco_inter" && (
            <Button variant="outline" size="sm" onClick={gerarCronSecret}>
              <RefreshCw size={12} /> Gerar Cron Secret
            </Button>
          )}

          {/* Tiny ERP: OAuth2 exige autorizar via redirect — salvar client_id/secret
              não conecta por si só. Mostra a URL de callback e o botão de autorizar,
              mais o reenvio de vendas que ficaram presas em fila_sync_externo. */}
          {editId === "tiny" && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <div>
                <label className="text-[11px] uppercase tracking-widest block mb-1 font-semibold text-gray-500">URL de Redirecionamento</label>
                <input readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/integracoes/tiny/callback`}
                  className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-white text-gray-500 select-all outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a href="/api/integracoes/tiny/auth"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors no-underline">
                  <ExternalLink size={12} /> {tinyConectado ? "Reconectar ao Tiny" : "Conectar ao Tiny"}
                </a>
                {tinyConectado && (
                  <Button variant="outline" size="sm" loading={retryingAllTiny} onClick={reenviarPendentesTiny}>
                    <RefreshCw size={12} /> Reenviar Pendentes
                  </Button>
                )}
              </div>
              {retryAllMsg && <p className={`text-xs ${retryAllMsg.tipo === "ok" ? "text-success-600" : "text-error-600"}`}>{retryAllMsg.texto}</p>}
            </div>
          )}

          {editErro && <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{editErro}</div>}
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="outline" size="md" onClick={fecharEdicao}>Cancelar</Button>
            <Button size="md" onClick={handleSave} loading={saving}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
