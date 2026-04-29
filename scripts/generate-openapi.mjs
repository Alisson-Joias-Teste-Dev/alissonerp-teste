// Requer servidor rodando em localhost:3000
// Usage: node scripts/generate-openapi.mjs
import { writeFileSync, mkdirSync } from "fs";

const res = await fetch("http://localhost:3000/api/openapi.json");
if (!res.ok) {
  throw new Error(`Falha ao buscar spec: ${res.status} ${res.statusText}`);
}
const spec = await res.json();
mkdirSync("docs/api", { recursive: true });
writeFileSync("docs/api/openapi.json", JSON.stringify(spec, null, 2));
console.log("OpenAPI spec gerada em docs/api/openapi.json");
