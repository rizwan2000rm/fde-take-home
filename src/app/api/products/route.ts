import type { NextRequest } from "next/server";
import { PRODUCTS } from "@/lib/products";
import { traceApiRoute } from "@/lib/server-telemetry";

export const GET = traceApiRoute("/api/products", async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const products = category ? PRODUCTS.filter((p) => p.category === category) : PRODUCTS;
  return Response.json({ products });
});
