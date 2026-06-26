import { NextResponse } from "next/server";
import { generateOpenAPISpec } from "@/lib/openapi-registry";

let cachedSpec: ReturnType<typeof generateOpenAPISpec> | null = null;
let cachedAt = 0;

export async function GET() {
  if (!cachedSpec || Date.now() - cachedAt > 5 * 60 * 1000) {
    cachedSpec = generateOpenAPISpec();
    cachedAt = Date.now();
  }
  return NextResponse.json(cachedSpec);
}
