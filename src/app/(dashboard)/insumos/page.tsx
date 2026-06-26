import { Metadata } from "next";
import InsumosClient from "./InsumosClient";

export const metadata: Metadata = { title: "Insumos" };

export default function InsumosPage() {
  return <InsumosClient />;
}
