"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { formatPrice } from "@/lib/products";
import { startOperation, trackEvent } from "@/lib/telemetry";

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
    const operation = startOperation("shop.checkout", {
      item_count: String(cart.itemCount), total_cents: String(cart.total),
    });
    let accepted = false;

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
        const code = Object.hasOwn(ERROR_MESSAGES, data.error) ? data.error : "unexpected_response";
        operation.finish("fail", code, { http_status: String(res.status) });
        setError(ERROR_MESSAGES[data.error] ?? "Something went wrong. Please try again.");
        return;
      }
      accepted = true;
      operation.finish("success", "none", { http_status: String(res.status) });
      for (const item of cart.items) {
        trackEvent("shop.product_purchased", { product_id: item.productId, quantity: String(item.quantity) });
      }
      await refresh();
      router.push(`/orders/${data.orderId}`);
    } catch {
      if (accepted) trackEvent("shop.checkout_ui_failure", { error_code: "post_checkout_refresh_failed" });
      else operation.finish("fail", "network_or_response_error");
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
