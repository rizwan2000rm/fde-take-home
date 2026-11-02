"use client";

import { useEffect, useRef } from "react";
import { trackView, type ShopView } from "@/lib/telemetry";

export function StoreView({ view, productId, category }: {
  view: ShopView;
  productId?: string;
  category?: string;
}) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const key = `${view}:${productId ?? ""}:${category ?? ""}`;
    // React Strict Mode replays effects in development.
    if (previous.current === key) return;
    previous.current = key;
    trackView(view, {
      ...(category ? { category } : {}),
      ...(productId ? { product_id: productId } : {}),
    });
  }, [view, productId, category]);
  return null;
}
