"use client";

import Link from "next/link";

interface PaginacaoProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  baseUrl: string;
  extraParams?: string;
}

function getVisiblePages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);

  return pages;
}

export default function Paginacao({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  baseUrl,
  extraParams,
}: PaginacaoProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const pages = getVisiblePages(currentPage, totalPages);

  const btnBase =
    "min-w-[36px] h-9 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center px-2";

  function pageUrl(p: number) {
    const params = extraParams ? `${extraParams}&page=${p}` : `page=${p}`;
    return `${baseUrl}?${params}`;
  }

  return (
    <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
      {/* Info */}
      <p className="text-xs order-2 sm:order-1" style={{ color: "#6B7280" }}>
        Mostrando {start}–{end} de {totalItems} ordens
      </p>

      {/* Botões */}
      <div className="flex items-center gap-1 order-1 sm:order-2">
        {/* Anterior */}
        {currentPage <= 1 ? (
          <span
            className={btnBase}
            style={{
              borderColor: "#E8DCC8",
              color: "#D1D5DB",
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            ← Ant.
          </span>
        ) : (
          <Link
            href={pageUrl(currentPage - 1)}
            className={btnBase}
            style={{ borderColor: "#E8DCC8", color: "#374151" }}
          >
            ← Ant.
          </Link>
        )}

        {/* Páginas numéricas — oculto em mobile */}
        <div className="hidden sm:flex items-center gap-1">
          {pages.map((p, i) =>
            p === "..." ? (
              <span
                key={`dots-${i}`}
                className="px-1 text-sm select-none"
                style={{ color: "#9CA3AF" }}
              >
                …
              </span>
            ) : (
              <Link
                key={p}
                href={pageUrl(p as number)}
                className={btnBase}
                style={
                  p === currentPage
                    ? { backgroundColor: "#184036", color: "#fff", borderColor: "#184036" }
                    : { borderColor: "#E8DCC8", color: "#374151" }
                }
              >
                {p}
              </Link>
            )
          )}
        </div>

        {/* Mobile: X/Total */}
        <span
          className="flex sm:hidden px-3 h-9 items-center text-sm rounded-lg border"
          style={{ borderColor: "#E8DCC8", color: "#374151" }}
        >
          {currentPage}/{totalPages}
        </span>

        {/* Próxima */}
        {currentPage >= totalPages ? (
          <span
            className={btnBase}
            style={{
              borderColor: "#E8DCC8",
              color: "#D1D5DB",
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            Próx. →
          </span>
        ) : (
          <Link
            href={pageUrl(currentPage + 1)}
            className={btnBase}
            style={{ borderColor: "#E8DCC8", color: "#374151" }}
          >
            Próx. →
          </Link>
        )}
      </div>
    </div>
  );
}
