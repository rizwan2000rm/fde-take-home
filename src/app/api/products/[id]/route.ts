import { getProduct } from "@/lib/products";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ product });
}
