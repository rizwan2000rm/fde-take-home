import type { NextRequest } from "next/server";
import { PRODUCTS } from "@/lib/products";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const products = category ? PRODUCTS.filter((p) => p.category === category) : PRODUCTS;
  return Response.json({ products });
}
