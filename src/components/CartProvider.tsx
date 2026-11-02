"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CartView } from "@/lib/store";

interface CartContextValue {
  cart: CartView;
  loading: boolean;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_CART: CartView = { items: [], itemCount: 0, total: 0 };
const CartContext = createContext<CartContextValue | null>(null);

async function cartRequest(method: string, body?: object): Promise<CartView> {
  const res = await fetch("/api/cart", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Cart request failed: ${res.status}`);
  return res.json();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartView>(EMPTY_CART);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setCart(await cartRequest("GET"));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    refresh().catch(() => {
      // Aborted (e.g. page navigated away) or network error: show an empty cart.
      setLoading(false);
    });
  }, [refresh]);

  const addItem = useCallback(async (productId: string, quantity = 1) => {
    setCart(await cartRequest("POST", { productId, quantity }));
  }, []);

  const setQuantity = useCallback(async (productId: string, quantity: number) => {
    setCart(await cartRequest("PATCH", { productId, quantity }));
  }, []);

  return (
    <CartContext.Provider value={{ cart, loading, addItem, setQuantity, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
