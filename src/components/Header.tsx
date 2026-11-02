"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

export function Header() {
  const { cart } = useCart();
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        🔭 Observable Outfitters
      </Link>
      <nav>
        <Link href="/">Shop</Link>
        <Link href="/cart" className="cart-link">
          Cart <span className="badge">{cart.itemCount}</span>
        </Link>
      </nav>
    </header>
  );
}
