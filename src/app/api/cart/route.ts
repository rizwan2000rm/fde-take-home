import { NextResponse, type NextRequest } from "next/server";
import { resolveCartId, withCartCookie } from "@/lib/cart-cookie";
import { getProduct } from "@/lib/products";
import { addToCart, clearCart, getCart, setCartQuantity } from "@/lib/store";
import { traceApiRoute } from "@/lib/server-telemetry";

export const GET = traceApiRoute("/api/cart", async function GET(request: NextRequest) {
  const { cartId, isNew } = resolveCartId(request);
  return withCartCookie(NextResponse.json(getCart(cartId)), cartId, isNew);
});

// Add an item: { productId, quantity? }
export const POST = traceApiRoute("/api/cart", async function POST(request: NextRequest) {
  const { cartId, isNew } = resolveCartId(request);
  const { productId, quantity = 1 } = await request.json();

  if (!getProduct(productId)) {
    return NextResponse.json({ error: "unknown_product" }, { status: 400 });
  }
  const qty = Math.max(1, Number(quantity));
  addToCart(cartId, productId, qty);
  return withCartCookie(NextResponse.json(getCart(cartId)), cartId, isNew);
});

// Set an item's quantity: { productId, quantity } (0 removes it)
export const PATCH = traceApiRoute("/api/cart", async function PATCH(request: NextRequest) {
  const { cartId, isNew } = resolveCartId(request);
  const { productId, quantity } = await request.json();
  setCartQuantity(cartId, productId, Math.max(0, Number(quantity)));
  return withCartCookie(NextResponse.json(getCart(cartId)), cartId, isNew);
});

export const DELETE = traceApiRoute("/api/cart", async function DELETE(request: NextRequest) {
  const { cartId, isNew } = resolveCartId(request);
  clearCart(cartId);
  return withCartCookie(NextResponse.json(getCart(cartId)), cartId, isNew);
});
