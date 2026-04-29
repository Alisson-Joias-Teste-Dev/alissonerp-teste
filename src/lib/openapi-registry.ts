import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

export function generateOpenAPISpec() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Alisson ERP API",
      version: "2.37.0",
      description:
        "API do ERP de joalheria Alisson. Schemas gerados automaticamente via Zod.",
    },
    servers: [{ url: "/api", description: "API base" }],
  });
}
