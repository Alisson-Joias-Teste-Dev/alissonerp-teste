import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Docs — Alisson Joias",
  description: "Documentação da API pública de produtos Alisson Joias",
};

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
