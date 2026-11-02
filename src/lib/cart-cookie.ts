import type { NextRequest, NextResponse } from "next/server";

export const CART_COOKIE = "cart_id";

// Returns the caller's cart id, minting a new one if the cookie is absent.
export function resolveCartId(request: NextRequest): { cartId: string; isNew: boolean } {
  const existing = request.cookies.get(CART_COOKIE)?.value;
  if (existing) return { cartId: existing, isNew: false };
  return { cartId: crypto.randomUUID(), isNew: true };
}

export function withCartCookie(response: NextResponse, cartId: string, isNew: boolean) {
  if (isNew) {
    response.cookies.set(CART_COOKIE, cartId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return response;
}
