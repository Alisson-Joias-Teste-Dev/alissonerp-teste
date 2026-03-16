"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo / marca */}
      <div className="text-center mb-8">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: C.sage }}>
          Sistema de Gestão
        </p>
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
        >
          ALISSON
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Joalheria &amp; Fábrica</p>
      </div>

      {/* Card */}
      <div
        className="rounded-2xl p-8 shadow-sm border"
        style={{ backgroundColor: "#fff", borderColor: C.cremeBorder }}
      >
        <h2 className="text-lg font-semibold mb-6" style={{ color: C.esmeralda }}>
          Entrar
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider" style={{ color: "#6B7280" }}>
              E-mail
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{
                borderColor: C.cremeBorder,
                // @ts-ignore
                "--tw-ring-color": C.esmeralda + "40",
              }}
              placeholder="seu@email.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Senha
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{ borderColor: C.cremeBorder }}
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>

      <p className="text-center text-xs mt-6" style={{ color: "#9CA3AF" }}>
        Fábrica AJ · v3.1
      </p>
    </div>
  );
}
