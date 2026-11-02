"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { formatPrice } from "@/lib/products";

const ERROR_MESSAGES: Record<string, string> = {
  payment_declined: "Your payment was declined. Please try another card.",
  out_of_stock: "One of your items is out of stock (max 5 per item).",
  empty_cart: "Your cart is empty.",
  missing_shipping_details: "Please fill in all shipping fields.",
};

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, loading, refresh } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping: {
            name: form.get("name"),
            email: form.get("email"),
            address: form.get("address"),
          },
          cardNumber: form.get("cardNumber"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error] ?? "Something went wrong. Please try again.");
        return;
      }
      await refresh();
      router.push(`/orders/${data.orderId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (cart.items.length === 0) {
    return (
      <p>
        Your cart is empty. <Link href="/">Continue shopping</Link>
      </p>
    );
  }

  return (
    <>
      <h1>Checkout</h1>
      <p className="muted">
        {cart.itemCount} item(s) · Total {formatPrice(cart.total)}
      </p>
      <form className="checkout-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Shipping</legend>
          <input name="name" placeholder="Full name" required />
          <input name="email" type="email" placeholder="Email" required />
          <textarea name="address" placeholder="Shipping address" rows={3} required />
        </fieldset>
        <fieldset>
          <legend>Payment</legend>
          <input
            name="cardNumber"
            inputMode="numeric"
            placeholder="Card number"
            defaultValue="4242 4242 4242 4242"
            required
          />
          <p className="hint">Use a card ending in 0002 to simulate a decline.</p>
        </fieldset>
        {error && <p className="err">{error}</p>}
        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? "Placing order…" : `Pay ${formatPrice(cart.total)}`}
        </button>
      </form>
    </>
  );
}
