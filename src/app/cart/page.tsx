"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { formatPrice } from "@/lib/products";

export default function CartPage() {
  const { cart, loading, setQuantity } = useCart();

  if (loading) return <p>Loading cart…</p>;

  if (cart.items.length === 0) {
    return (
      <>
        <h1>Your cart</h1>
        <p>
          Your cart is empty. <Link href="/">Continue shopping</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Your cart</h1>
      <table className="cart-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.productId}>
              <td>
                {item.product.emoji} {item.product.name}
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(e) => setQuantity(item.productId, Number(e.target.value))}
                />
              </td>
              <td>{formatPrice(item.lineTotal)}</td>
              <td>
                <button className="btn link" onClick={() => setQuantity(item.productId, 0)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cart-summary">
        <p className="price">Total: {formatPrice(cart.total)}</p>
        <Link href="/checkout" className="btn primary">
          Proceed to checkout
        </Link>
      </div>
    </>
  );
}
