import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { CheckCircle, Clock, XCircle, type LucideIcon } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// Página pública de retorno do Mercado Pago após pagamento.
//
// URLs:
//   /pagamento/{token}/sucesso
//   /pagamento/{token}/pendente
//   /pagamento/{token}/erro
//
// token = vendas_erp.token_compartilhamento (UUID, não expõe ID interno)
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_VALIDOS = ["sucesso", "pendente", "erro"] as const;
type StatusPagamento = typeof STATUS_VALIDOS[number];

interface StatusConfig {
  titulo: string;
  subtitulo: string;
  descricao: string;
  cor: string;
  corFundo: string;
  icone: LucideIcon;
}

const CONFIG: Record<StatusPagamento, StatusConfig> = {
  sucesso: {
    titulo: "Pagamento aprovado!",
    subtitulo: "Recebemos sua confirmação.",
    descricao: "Sua compra na Alisson Joias foi registrada com sucesso. Em instantes nossa equipe entrará em contato para combinar os próximos passos.",
    cor: "#059669",
    corFundo: "#ECFDF5",
    icone: CheckCircle,
  },
  pendente: {
    titulo: "Pagamento em análise",
    subtitulo: "Estamos aguardando a confirmação.",
    descricao: "Seu pagamento está sendo processado. Quando o Mercado Pago confirmar, nossa equipe será notificada automaticamente e entrará em contato.",
    cor: "#D97706",
    corFundo: "#FEF3C7",
    icone: Clock,
  },
  erro: {
    titulo: "Pagamento não concluído",
    subtitulo: "Houve um problema com a transação.",
    descricao: "Tente novamente ou entre em contato com sua consultora para gerar um novo link de pagamento.",
    cor: "#DC2626",
    corFundo: "#FEF2F2",
    icone: XCircle,
  },
};

export default async function PagamentoStatusPage({
  params,
}: {
  params: Promise<{ token: string; status: string }>;
}) {
  const { token, status } = await params;

  if (!STATUS_VALIDOS.includes(status as StatusPagamento)) {
    notFound();
  }

  const [venda] = await sql`
    SELECT numero_venda, total_venda
    FROM alissonerp.vendas_erp
    WHERE token_compartilhamento = ${token}::uuid
    LIMIT 1
  `;
  if (!venda) notFound();

  const cfg = CONFIG[status as StatusPagamento];
  const Icone = cfg.icone;
  const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(venda.total_venda));

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "#FAFAF7" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center shadow-xl"
        style={{ backgroundColor: "#ffffff", border: "1px solid #E8DCC8" }}
      >
        <div
          className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: cfg.corFundo }}
        >
          <Icone size={40} style={{ color: cfg.cor }} />
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: "#184036" }}>
          {cfg.titulo}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#6B7280" }}>
          {cfg.subtitulo}
        </p>

        <div
          className="rounded-xl p-4 mb-6 text-left"
          style={{ backgroundColor: "#FAFAF7", border: "1px solid #E8DCC8" }}
        >
          <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>
            Venda {String(venda.numero_venda)}
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: "#184036" }}>
            {valor}
          </p>
        </div>

        <p className="text-sm mb-6" style={{ color: "#374151" }}>
          {cfg.descricao}
        </p>

        <div className="pt-5 border-t" style={{ borderColor: "#E8DCC8" }}>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            Alisson Joias
          </p>
          <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>
            Dúvidas? Entre em contato com sua consultora
          </p>
        </div>
      </div>
    </div>
  );
}
