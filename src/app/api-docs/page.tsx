"use client";

import { useState, useEffect, useRef } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────
function Badge({ method }: { method: "GET" | "POST" | "PATCH" | "DELETE" }) {
  const colors: Record<string, string> = {
    GET:    "background:#DCFCE7;color:#166534",
    POST:   "background:#DBEAFE;color:#1E40AF",
    PATCH:  "background:#FEF9C3;color:#854D0E",
    DELETE: "background:#FEE2E2;color:#991B1B",
  };
  const [bg, fg] = colors[method].split(";").map((s) => s.split(":")[1]);
  return (
    <span
      style={{ background: bg, color: fg }}
      className="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono mr-2 select-none"
    >
      {method}
    </span>
  );
}

function Code({ children, lang = "json" }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative group rounded-xl overflow-hidden mt-3 mb-4" style={{ background: "#0F172A" }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "#1E293B" }}>
        <span className="text-xs font-mono" style={{ color: "#64748B" }}>{lang}</span>
        <button
          onClick={copy}
          className="text-xs px-2 py-0.5 rounded transition-all"
          style={{ color: copied ? "#4ADE80" : "#64748B", background: "#1E293B" }}
        >
          {copied ? "✓ copiado" : "copiar"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed" style={{ color: "#E2E8F0", fontFamily: "monospace" }}>
        {children.trim()}
      </pre>
    </div>
  );
}

function Callout({ type, children }: { type: "info" | "warning" | "tip"; children: React.ReactNode }) {
  const styles = {
    info:    { bg: "#EFF6FF", border: "#3B82F6", icon: "ℹ️", label: "Informação" },
    warning: { bg: "#FFFBEB", border: "#F59E0B", icon: "⚠️", label: "Atenção"    },
    tip:     { bg: "#F0FDF4", border: "#22C55E", icon: "💡", label: "Dica"        },
  }[type];
  return (
    <div
      className="rounded-xl p-4 mb-4 border-l-4 text-sm"
      style={{ background: styles.bg, borderColor: styles.border }}
    >
      <span className="font-semibold mr-2">{styles.icon} {styles.label}:</span>
      {children}
    </div>
  );
}

function Param({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="border-b py-3" style={{ borderColor: "#F1F5F9" }}>
      <div className="flex items-center gap-2 mb-1">
        <code className="text-sm font-bold" style={{ color: "#0F172A" }}>{name}</code>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#F1F5F9", color: "#64748B" }}>{type}</span>
        {required && <span className="text-xs font-medium" style={{ color: "#EF4444" }}>obrigatório</span>}
      </div>
      <p className="text-sm" style={{ color: "#64748B" }}>{children}</p>
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold mb-4 pt-2" style={{ color: "#0F172A" }}>
      {children}
    </h2>
  );
}

function SubTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold mb-3 mt-8" style={{ color: "#1E293B" }}>
      {children}
    </h3>
  );
}

// ── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "introducao",      label: "Introdução"          },
  { id: "autenticacao",    label: "Autenticação"         },
  { id: "rate-limit",      label: "Rate Limiting"        },
  { id: "formato",         label: "Formato das respostas"},
  { id: "erros",           label: "Erros"                },
  { id: "endpoints",       label: "Endpoints",           children: [
    { id: "listar-produtos",  label: "Listar produtos"  },
    { id: "detalhe-produto",  label: "Detalhe do produto"},
  ]},
  { id: "webhooks",        label: "Webhooks"             },
  { id: "changelog",       label: "Changelog"            },
];

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ApiDocsPage() {
  const [active, setActive] = useState("introducao");
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sections = document.querySelectorAll("[data-section]");
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach((s) => observer.current?.observe(s));
    return () => observer.current?.disconnect();
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b" style={{ background: "#fff", borderColor: "#E2E8F0" }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold" style={{ color: "#0F172A" }}>💎 Alisson Joias</span>
            <span className="text-sm px-2 py-0.5 rounded-full font-medium" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
              API Docs
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F1F5F9", color: "#64748B" }}>
              v1
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ color: "#64748B" }}>Base URL:</span>
            <code className="text-sm px-3 py-1 rounded-lg" style={{ background: "#F1F5F9", color: "#0F172A" }}>
              https://alissonjoias.com.br/api/v1
            </code>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-4">
          <nav className="space-y-1">
            {NAV.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => scrollTo(item.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: active === item.id ? "#EFF6FF" : "transparent",
                    color: active === item.id ? "#1D4ED8" : "#475569",
                    fontWeight: active === item.id ? 600 : 400,
                  }}
                >
                  {item.label}
                </button>
                {item.children?.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => scrollTo(child.id)}
                    className="w-full text-left pl-7 pr-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: active === child.id ? "#EFF6FF" : "transparent",
                      color: active === child.id ? "#1D4ED8" : "#94A3B8",
                      fontWeight: active === child.id ? 600 : 400,
                    }}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="mt-8 mx-3 p-3 rounded-xl border" style={{ borderColor: "#E2E8F0", background: "#fff" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#64748B" }}>Suporte técnico</p>
            <p className="text-xs" style={{ color: "#94A3B8" }}>Dúvidas sobre a integração?</p>
            <a href="mailto:jonathan@alissonjoias.com.br" className="text-xs font-medium mt-1 block" style={{ color: "#1D4ED8" }}>
              jonathan@alissonjoias.com.br
            </a>
          </div>
        </aside>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 py-8 px-8">

          {/* ── Introdução ────────────────────────────────────────────────── */}
          <section id="introducao" data-section className="mb-12">
            <div className="rounded-2xl p-8 mb-8" style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)" }}>
              <h1 className="text-3xl font-bold mb-2" style={{ color: "#fff" }}>API de Produtos</h1>
              <p className="text-lg mb-4" style={{ color: "#94A3B8" }}>
                Integre o catálogo de produtos da Alisson Joias com o seu site em tempo real.
              </p>
              <div className="flex flex-wrap gap-3">
                {["REST JSON", "API Key Auth", "Rate Limiting", "Webhooks", "Paginação"].map((tag) => (
                  <span key={tag} className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: "#1E293B", color: "#94A3B8" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <SectionTitle id="introducao-texto">O que você pode fazer</SectionTitle>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              A API de Produtos da Alisson Joias permite que você consulte o catálogo completo de joias,
              incluindo preços, fotos, categorias e variações. Toda alteração feita no ERP é refletida
              automaticamente no site via <strong>webhooks</strong> — sem necessidade de polling.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { icon: "🔐", title: "Segura",       desc: "Autenticação por API key com rate limiting automático"  },
                { icon: "⚡", title: "Tempo real",   desc: "Webhooks notificam seu site imediatamente após cada mudança" },
                { icon: "📄", title: "Paginada",     desc: "Suporte a paginação e sincronização incremental"         },
              ].map((c) => (
                <div key={c.title} className="rounded-xl p-4 border" style={{ background: "#fff", borderColor: "#E2E8F0" }}>
                  <div className="text-2xl mb-2">{c.icon}</div>
                  <div className="font-semibold text-sm mb-1" style={{ color: "#0F172A" }}>{c.title}</div>
                  <div className="text-xs leading-relaxed" style={{ color: "#64748B" }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Autenticação ──────────────────────────────────────────────── */}
          <section id="autenticacao" data-section className="mb-12">
            <SectionTitle id="autenticacao">Autenticação</SectionTitle>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              Todas as requisições devem incluir o header <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#F1F5F9", color: "#0F172A" }}>X-API-Key</code> com
              a chave fornecida pelo time da Alisson Joias. As chaves seguem o formato <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#F1F5F9", color: "#0F172A" }}>sk_live_...</code>
            </p>

            <Callout type="warning">
              Nunca exponha sua API key no código front-end ou em repositórios públicos. Trate-a como uma senha.
            </Callout>

            <Code lang="http">
{`GET /api/v1/produtos HTTP/1.1
Host: alissonjoias.com.br
X-API-Key: sk_live_sua_chave_aqui`}
            </Code>

            <p className="text-sm mb-3" style={{ color: "#475569" }}>
              Também é aceito o header <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#F1F5F9", color: "#0F172A" }}>Authorization: Bearer sk_live_...</code> como alternativa.
            </p>

            <SubTitle id="autenticacao-erros">Respostas de autenticação</SubTitle>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#E2E8F0" }}>
              <table className="w-full text-sm">
                <thead style={{ background: "#F8FAFC" }}>
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Código</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Situação</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["401", "Sem header", "Header X-API-Key ausente na requisição"],
                    ["401", "Chave inválida", "A chave enviada não existe ou foi revogada"],
                    ["429", "Rate limit", "Número máximo de requisições por minuto excedido"],
                  ].map(([code, sit, desc]) => (
                    <tr key={code + sit} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#991B1B" }}>{code}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-xs" style={{ color: "#0F172A" }}>{sit}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Rate Limit ────────────────────────────────────────────────── */}
          <section id="rate-limit" data-section className="mb-12">
            <SectionTitle id="rate-limit">Rate Limiting</SectionTitle>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              Por padrão, cada chave pode realizar até <strong>60 requisições por minuto</strong> (janela deslizante de 60 segundos).
              Quando o limite é atingido, a API retorna HTTP <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>429</code> com os headers abaixo.
            </p>

            <Code lang="http">
{`HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 60

{
  "error": "Rate limit excedido",
  "hint": "Máximo 60 requisições por minuto"
}`}
            </Code>

            <Callout type="tip">
              Para sincronização do catálogo completo, use o parâmetro <code>updated_after</code> para buscar apenas os produtos alterados desde a última sincronização, reduzindo drasticamente o número de requisições.
            </Callout>
          </section>

          {/* ── Formato ───────────────────────────────────────────────────── */}
          <section id="formato" data-section className="mb-12">
            <SectionTitle id="formato">Formato das respostas</SectionTitle>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              Todas as respostas são em <strong>JSON</strong>. Listas retornam um objeto com três chaves:
              <code className="px-1 py-0.5 rounded text-xs mx-1" style={{ background: "#F1F5F9" }}>data</code>,
              <code className="px-1 py-0.5 rounded text-xs mx-1" style={{ background: "#F1F5F9" }}>meta</code> e
              <code className="px-1 py-0.5 rounded text-xs mx-1" style={{ background: "#F1F5F9" }}>links</code>.
            </p>

            <Code lang="json">
{`{
  "data": [ /* array de objetos */ ],
  "meta": {
    "total":     248,
    "page":      1,
    "per_page":  20,
    "last_page": 13,
    "timestamp": "2026-04-24T10:00:00.000Z"
  },
  "links": {
    "self": "/api/v1/produtos?page=1&per_page=20",
    "next": "/api/v1/produtos?page=2&per_page=20",
    "prev": null
  }
}`}
            </Code>

            <p className="text-sm mb-3" style={{ color: "#475569" }}>
              Recursos individuais (detalhe) retornam:
            </p>

            <Code lang="json">
{`{
  "data": { /* objeto do produto */ },
  "meta": {}
}`}
            </Code>
          </section>

          {/* ── Erros ─────────────────────────────────────────────────────── */}
          <section id="erros" data-section className="mb-12">
            <SectionTitle id="erros">Erros</SectionTitle>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              Erros sempre retornam um objeto JSON com o campo <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>error</code> e, quando disponível,
              um campo <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>hint</code> com orientação de correção.
            </p>

            <Code lang="json">
{`{
  "error": "Produto não encontrado"
}`}
            </Code>

            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#E2E8F0" }}>
              <table className="w-full text-sm">
                <thead style={{ background: "#F8FAFC" }}>
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>HTTP</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Significado</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["200", "Sucesso"],
                    ["201", "Criado com sucesso"],
                    ["400", "Parâmetro inválido (ex: ID não numérico)"],
                    ["401", "Não autenticado — API key ausente ou inválida"],
                    ["404", "Recurso não encontrado"],
                    ["429", "Rate limit excedido"],
                    ["500", "Erro interno — contate o suporte"],
                  ].map(([code, desc]) => (
                    <tr key={code} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-xs px-2 py-0.5 rounded font-bold"
                          style={{
                            background: code.startsWith("2") ? "#DCFCE7" : code.startsWith("4") ? "#FEE2E2" : "#FEF9C3",
                            color:      code.startsWith("2") ? "#166534" : code.startsWith("4") ? "#991B1B" : "#854D0E",
                          }}
                        >
                          {code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Endpoints ─────────────────────────────────────────────────── */}
          <section id="endpoints" data-section className="mb-12">
            <SectionTitle id="endpoints">Endpoints</SectionTitle>

            {/* Listar produtos */}
            <div id="listar-produtos" data-section className="mb-10 rounded-2xl border overflow-hidden" style={{ borderColor: "#E2E8F0", background: "#fff" }}>
              <div className="px-6 py-4 border-b" style={{ background: "#F8FAFC", borderColor: "#E2E8F0" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge method="GET" />
                  <code className="font-mono text-sm font-bold" style={{ color: "#0F172A" }}>/api/v1/produtos</code>
                </div>
                <p className="text-sm" style={{ color: "#64748B" }}>Retorna a lista paginada de produtos do catálogo.</p>
              </div>

              <div className="px-6 py-5">
                <h4 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#94A3B8" }}>Parâmetros de query</h4>

                <Param name="page" type="integer">Número da página. Padrão: <code>1</code></Param>
                <Param name="per_page" type="integer">Itens por página. Mínimo: 1, Máximo: 100. Padrão: <code>20</code></Param>
                <Param name="situacao" type="string">
                  Filtra por situação do produto. Valores: <code>ativo</code> (padrão), <code>inativo</code>, <code>todos</code>
                </Param>
                <Param name="categoria" type="string">
                  Busca parcial na categoria. Ex: <code>Aneis</code>, <code>Brincos</code>, <code>Correntes</code>
                </Param>
                <Param name="q" type="string">
                  Busca por nome ou SKU do produto. Ex: <code>solitário</code>
                </Param>
                <Param name="updated_after" type="ISO 8601">
                  Retorna apenas produtos atualizados após a data informada. Ideal para <strong>sincronização incremental</strong>.
                  Ex: <code>2026-04-01T00:00:00Z</code>
                </Param>

                <h4 className="text-xs font-bold uppercase tracking-wide mt-5 mb-3" style={{ color: "#94A3B8" }}>Exemplo de requisição</h4>
                <Code lang="bash">
{`curl https://alissonjoias.com.br/api/v1/produtos \\
  -H "X-API-Key: sk_live_sua_chave_aqui" \\
  -G \\
  --data-urlencode "page=1" \\
  --data-urlencode "per_page=20" \\
  --data-urlencode "situacao=ativo"`}
                </Code>

                <h4 className="text-xs font-bold uppercase tracking-wide mt-5 mb-3" style={{ color: "#94A3B8" }}>Exemplo de resposta</h4>
                <Code lang="json">
{`{
  "data": [
    {
      "id":                    1042,
      "nome":                  "Anel Solitário 4 Garras",
      "sku":                   "AN-1042",
      "situacao":              "A",
      "tipo_metal":            "Ouro 18k Amarelo",
      "peso":                  3.5,
      "preco":                 2850,
      "preco_com_pedras":      3200,
      "tem_pedra_preciosa":    true,
      "foto":                  "https://alissonjoias.com.br/storage/produtos/AN-1042.jpg",
      "categoria":             "Anéis",
      "categoria_precificacao":"Ouro 18k",
      "markup":                3.2,
      "updated_at":            "2026-04-22T14:30:00.000Z"
    }
  ],
  "meta": {
    "total":     248,
    "page":      1,
    "per_page":  20,
    "last_page": 13,
    "timestamp": "2026-04-24T10:00:00.000Z"
  },
  "links": {
    "self": "/api/v1/produtos?page=1&per_page=20",
    "next": "/api/v1/produtos?page=2&per_page=20",
    "prev": null
  }
}`}
                </Code>

                <h4 className="text-xs font-bold uppercase tracking-wide mt-5 mb-3" style={{ color: "#94A3B8" }}>Campos do produto</h4>
                <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#E2E8F0" }}>
                  <table className="w-full text-xs">
                    <thead style={{ background: "#F8FAFC" }}>
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Campo</th>
                        <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Tipo</th>
                        <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["id",                    "integer",  "ID único do produto"],
                        ["nome",                  "string",   "Nome completo do produto"],
                        ["sku",                   "string",   "Código de referência interno"],
                        ["situacao",              "string",   '"A" = Ativo, "I" = Inativo'],
                        ["tipo_metal",            "string",   "Ex: Ouro 18k Amarelo, Prata 925"],
                        ["peso",                  "decimal",  "Peso em gramas usado para precificação"],
                        ["preco",                 "integer",  "Preço de venda em centavos — ex: 285000 = R$ 2.850,00"],
                        ["preco_com_pedras",       "integer",  "Preço total incluindo pedras preciosas (quando houver)"],
                        ["tem_pedra_preciosa",    "boolean",  "true se o produto tem pedra preciosa"],
                        ["foto",                  "string",   "URL pública da imagem principal"],
                        ["categoria",             "string",   "Categoria geral: Anéis, Brincos, Colares..."],
                        ["categoria_precificacao","string",   "Categoria de precificação interna"],
                        ["markup",                "decimal",  "Multiplicador de markup aplicado"],
                        ["updated_at",            "ISO 8601", "Data/hora da última atualização"],
                      ].map(([field, type, desc]) => (
                        <tr key={field} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                          <td className="px-4 py-2 font-mono font-bold" style={{ color: "#0F172A" }}>{field}</td>
                          <td className="px-4 py-2" style={{ color: "#64748B" }}>{type}</td>
                          <td className="px-4 py-2" style={{ color: "#475569" }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Detalhe produto */}
            <div id="detalhe-produto" data-section className="mb-10 rounded-2xl border overflow-hidden" style={{ borderColor: "#E2E8F0", background: "#fff" }}>
              <div className="px-6 py-4 border-b" style={{ background: "#F8FAFC", borderColor: "#E2E8F0" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge method="GET" />
                  <code className="font-mono text-sm font-bold" style={{ color: "#0F172A" }}>/api/v1/produtos/:id</code>
                </div>
                <p className="text-sm" style={{ color: "#64748B" }}>Retorna os dados completos de um produto, incluindo variações e composição.</p>
              </div>

              <div className="px-6 py-5">
                <h4 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#94A3B8" }}>Parâmetros de path</h4>
                <Param name=":id" type="integer" required>ID numérico do produto. Ex: <code>/api/v1/produtos/1042</code></Param>

                <h4 className="text-xs font-bold uppercase tracking-wide mt-5 mb-3" style={{ color: "#94A3B8" }}>Exemplo de requisição</h4>
                <Code lang="bash">
{`curl https://alissonjoias.com.br/api/v1/produtos/1042 \\
  -H "X-API-Key: sk_live_sua_chave_aqui"`}
                </Code>

                <h4 className="text-xs font-bold uppercase tracking-wide mt-5 mb-3" style={{ color: "#94A3B8" }}>Exemplo de resposta</h4>
                <Code lang="json">
{`{
  "data": {
    "id":                    1042,
    "nome":                  "Anel Solitário 4 Garras",
    "sku":                   "AN-1042",
    "situacao":              "A",
    "tipo_metal":            "Ouro 18k Amarelo",
    "peso":                  3.5,
    "preco":                 2850,
    "preco_com_pedras":      3200,
    "tem_pedra_preciosa":    true,
    "foto":                  "https://alissonjoias.com.br/storage/produtos/AN-1042.jpg",
    "categoria":             "Anéis",
    "eh_pai":                true,
    "eh_variacao":           false,
    "observacao_erp":        null,
    "updated_at":            "2026-04-22T14:30:00.000Z",

    "variacoes": [
      { "id": 1043, "nome": "Anel Solitário 4G TAM 12", "sku": "AN-1042-12", "numeracao": "12" },
      { "id": 1044, "nome": "Anel Solitário 4G TAM 14", "sku": "AN-1042-14", "numeracao": "14" },
      { "id": 1045, "nome": "Anel Solitário 4G TAM 16", "sku": "AN-1042-16", "numeracao": "16" }
    ],

    "composicao": [
      { "item": "Ouro 18k Amarelo", "quantidade": 3.5, "unidade": "g"  },
      { "item": "Brilhante 3pts",   "quantidade": 1,   "unidade": "un" }
    ]
  },
  "meta": {}
}`}
                </Code>
              </div>
            </div>
          </section>

          {/* ── Webhooks ──────────────────────────────────────────────────── */}
          <section id="webhooks" data-section className="mb-12">
            <SectionTitle id="webhooks">Webhooks</SectionTitle>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              Ao invés de fazer polling, o seu site pode receber notificações automáticas sempre que um produto
              for criado, alterado ou desativado no ERP. Basta fornecer uma URL de endpoint no seu servidor.
            </p>

            <Callout type="info">
              Para ativar os webhooks, envie a URL do seu endpoint para o time da Alisson Joias. Ela será configurada no ERP e os eventos começarão a ser disparados imediatamente.
            </Callout>

            <SubTitle id="webhooks-eventos">Eventos disponíveis</SubTitle>
            <div className="overflow-hidden rounded-xl border mb-6" style={{ borderColor: "#E2E8F0" }}>
              <table className="w-full text-sm">
                <thead style={{ background: "#F8FAFC" }}>
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Evento</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#64748B" }}>Quando ocorre</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["produto.criado",      "Novo produto cadastrado no ERP"],
                    ["produto.atualizado",  "Preço, nome, foto, categoria ou situação alterada"],
                    ["produto.desativado",  "Produto marcado como inativo (deve sair do site)"],
                  ].map(([ev, desc]) => (
                    <tr key={ev} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#F1F5F9", color: "#0F172A" }}>{ev}</code>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SubTitle id="webhooks-payload">Formato do payload</SubTitle>
            <p className="text-sm mb-3" style={{ color: "#475569" }}>
              O ERP fará um <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>POST</code> para a sua URL com o seguinte corpo:
            </p>
            <Code lang="json">
{`{
  "evento":     "produto.atualizado",
  "produto_id": 1042,
  "nome":       "Anel Solitário 4 Garras",
  "situacao":   "A",
  "timestamp":  "2026-04-24T10:30:00.000Z"
}`}
            </Code>

            <SubTitle id="webhooks-resposta">O que seu endpoint deve retornar</SubTitle>
            <p className="text-sm mb-3" style={{ color: "#475569" }}>
              Seu endpoint deve responder com HTTP <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>200</code> em até <strong>10 segundos</strong>.
              Após receber o evento, faça uma requisição para <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>/api/v1/produtos/:id</code> para buscar os dados atualizados.
            </p>

            <Callout type="tip">
              O payload do webhook contém apenas dados básicos do produto. Para obter todos os campos atualizados, faça uma requisição GET ao endpoint de detalhe usando o <code>produto_id</code> recebido.
            </Callout>

            <SubTitle id="webhooks-exemplo">Exemplo de handler (Node.js)</SubTitle>
            <Code lang="javascript">
{`// Express.js
app.post("/webhook/produtos", express.json(), async (req, res) => {
  const { evento, produto_id } = req.body;

  // Responder imediatamente (antes de processar)
  res.status(200).json({ ok: true });

  if (evento === "produto.atualizado" || evento === "produto.criado") {
    // Buscar dados completos
    const response = await fetch(
      \`https://alissonjoias.com.br/api/v1/produtos/\${produto_id}\`,
      { headers: { "X-API-Key": process.env.ALISSON_API_KEY } }
    );
    const { data: produto } = await response.json();

    // Atualizar seu banco de dados
    await db.produtos.upsert({ id: produto_id, ...produto });
  }

  if (evento === "produto.desativado") {
    await db.produtos.update({ id: produto_id }, { ativo: false });
  }
});`}
            </Code>
          </section>

          {/* ── Changelog ─────────────────────────────────────────────────── */}
          <section id="changelog" data-section className="mb-12">
            <SectionTitle id="changelog">Changelog</SectionTitle>
            <div className="space-y-4">
              {[
                {
                  version: "v1.0.0",
                  date: "Abril 2026",
                  changes: [
                    "Lançamento da API pública de produtos",
                    "Endpoint GET /api/v1/produtos com paginação e filtros",
                    "Endpoint GET /api/v1/produtos/:id com variações e composição",
                    "Autenticação por API key (X-API-Key)",
                    "Rate limiting: 60 req/min por chave",
                    "Webhooks: produto.criado, produto.atualizado, produto.desativado",
                    "Suporte a sincronização incremental via updated_after",
                  ],
                },
              ].map((release) => (
                <div key={release.version} className="rounded-xl border p-5" style={{ background: "#fff", borderColor: "#E2E8F0" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-bold font-mono" style={{ color: "#0F172A" }}>{release.version}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#DCFCE7", color: "#166534" }}>Lançamento</span>
                    <span className="text-xs" style={{ color: "#94A3B8" }}>{release.date}</span>
                  </div>
                  <ul className="space-y-1">
                    {release.changes.map((c) => (
                      <li key={c} className="text-sm flex items-start gap-2" style={{ color: "#475569" }}>
                        <span style={{ color: "#22C55E" }}>+</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
