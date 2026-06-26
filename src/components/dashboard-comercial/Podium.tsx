"use client";

import { motion } from "framer-motion";
import { Trophy, Medal, Award } from "lucide-react";
import type { RankingConsultora } from "@/lib/types/dashboard-comercial";
import { P } from "./theme";
import { formatBRL } from "@/lib/dashboard-comercial/utils";
import ConsultoraAvatar from "./ConsultoraAvatar";

export interface PodiumProps {
  top3: RankingConsultora[];
}

const BASE_ORDER: Array<{ pos: 1 | 2 | 3; height: number; delay: number }> = [
  { pos: 2, height: 100, delay: 0.2 },
  { pos: 1, height: 140, delay: 0.4 },
  { pos: 3, height: 80, delay: 0 },
];

const MEDAL_COR = {
  1: { bg: "#FEDDB4", fg: "#8A5A1D", icon: Trophy },
  2: { bg: "#E0E0E0", fg: "#555555", icon: Medal },
  3: { bg: "#E5C8A9", fg: "#704A28", icon: Award },
} as const;

export default function Podium({ top3 }: PodiumProps) {
  // Reordena top3 por posição 1/2/3
  const byPos = new Map<number, RankingConsultora>();
  top3.forEach((r) => byPos.set(r.posicao, r));

  return (
    <div
      className="rounded-xl p-6"
      style={{ backgroundColor: P.esmeraldaDeep, border: `1px solid ${P.esmeraldaMid}` }}
    >
      <h3
        className="mb-6 text-center text-lg font-semibold"
        style={{ color: P.creme, fontFamily: "var(--font-playfair)" }}
      >
        Top 3 Consultoras
      </h3>

      <div className="flex items-end justify-center gap-4 sm:gap-6">
        {BASE_ORDER.map((item) => {
          const consultora = byPos.get(item.pos);
          if (!consultora) {
            return (
              <div key={item.pos} className="flex w-24 flex-col items-center opacity-30">
                <div
                  className="h-24 w-24 rounded-full"
                  style={{ backgroundColor: P.esmeraldaLight }}
                />
                <div
                  className="mt-2 w-full rounded-t-lg text-center text-sm font-medium"
                  style={{ backgroundColor: P.esmeraldaLight, color: P.cremeMuted, height: item.height }}
                >
                  <span className="block pt-6">#{item.pos}</span>
                </div>
              </div>
            );
          }
          const cor = MEDAL_COR[item.pos];
          const Icon = cor.icon;
          return (
            <motion.div
              key={item.pos}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: item.delay, ease: "easeOut" }}
              className="flex w-28 flex-col items-center"
            >
              <div className="relative">
                <ConsultoraAvatar nome={consultora.nome} foto={consultora.foto} size={80} />
                <div
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: cor.bg, color: cor.fg }}
                >
                  <Icon size={14} strokeWidth={2} />
                </div>
              </div>
              <div
                className="mt-2 text-center text-xs font-semibold"
                style={{ color: P.creme, fontFamily: "var(--font-dm-sans)" }}
              >
                {consultora.nome.split(" ").slice(0, 2).join(" ")}
              </div>
              <div
                className="mt-1 text-center text-[10px] tabular-nums"
                style={{ color: P.dourado }}
              >
                {formatBRL(consultora.valor_liquido)}
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: item.height }}
                transition={{ duration: 0.8, delay: item.delay + 0.3, ease: "easeOut" }}
                className="mt-2 flex w-full items-center justify-center rounded-t-lg text-lg font-bold"
                style={{
                  backgroundColor: item.pos === 1 ? P.dourado : item.pos === 2 ? "#A0A0A0" : "#8C6645",
                  color: P.esmeraldaDeep,
                }}
              >
                #{item.pos}
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
