import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { redirect } from "next/navigation";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarData(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + " " + date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Nome do usuário — fonte: alissonerp.usuarios (fonte de verdade)
  let nomeUsuario = (user.user_metadata?.nome as string | undefined) || user.email?.split("@")[0] || "Usuário";
  try {
    const [u] = await sql<{ nome: string }[]>`
      SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (u?.nome) nomeUsuario = u.nome;
  } catch {
    // fallback: JWT já definido acima
  }

  // Saudação dinâmica (horário de Brasília)
  const agora = new Date();
  const horaBrasilia = new Date(
    agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const hora = horaBrasilia.getHours();
  const saudacao =
    hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  // Cotações — public.parametros (fonte de verdade para precificação)
  let cotacaoOuro = 0;
  let cotacaoDolar = 0;

  try {
    const [params] = await sql<{ ouro: string; dollar: string }[]>`
      SELECT ouro, dollar
      FROM public.parametros
      LIMIT 1
    `;
    cotacaoOuro = Number(params?.ouro ?? 0);
    cotacaoDolar = Number(params?.dollar ?? 0);
  } catch {
    // Se falhar, exibe "Indisponível"
  }

  const dataAtualizacao = formatarData(agora);

  return (
    <div className="flex flex-col items-center min-h-[90vh] pt-16">

      {/* Saudação */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-light text-gray-800">
          {saudacao},{" "}
          <span className="font-semibold">{nomeUsuario}</span>{" "}
          👋
        </h1>
        <p className="text-gray-400 mt-2">Bem-vindo ao Alisson ERP</p>
      </div>

      {/* Leão da marca */}
      <div className="flex justify-center flex-1">
        <img
          src="/logo.leaoverde.webp"
          alt="Alisson"
          className="h-80 w-auto"
          draggable={false}
        />
      </div>

      {/* Cotações */}
      <div className="flex flex-wrap gap-6 justify-center mb-4 mt-8">

        {/* Card Ouro 24K */}
        <div className="bg-white rounded-xl border border-[var(--color-creme-200)] shadow-sm p-6 w-56 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            🏅 Ouro 24K
          </p>
          <p className="text-2xl font-mono font-bold text-gray-800 mt-2">
            {cotacaoOuro > 0
              ? `R$ ${formatarMoeda(cotacaoOuro)}/g`
              : "Indisponível"}
          </p>
        </div>

        {/* Card Dólar */}
        <div className="bg-white rounded-xl border border-[var(--color-creme-200)] shadow-sm p-6 w-56 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            💵 Dólar
          </p>
          <p className="text-2xl font-mono font-bold text-gray-800 mt-2">
            {cotacaoDolar > 0
              ? `R$ ${formatarMoeda(cotacaoDolar)}`
              : "Indisponível"}
          </p>
        </div>

      </div>

      {/* Rodapé */}
      <p className="text-xs text-gray-300 mt-6">
        Atualizado: {dataAtualizacao} · Fonte: Fixer API
      </p>

    </div>
  );
}
