import type { Metadata } from "next";
import PerfilClient from "./PerfilClient";

export const metadata: Metadata = {
  title: "Perfil | Alisson ERP",
};

export default function PerfilPage() {
  return <PerfilClient />;
}
