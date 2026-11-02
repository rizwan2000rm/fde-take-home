import { NextResponse, type NextRequest } from "next/server";
import { resolveCartId } from "@/lib/cart-cookie";
import { chargeCard, PaymentDeclinedError } from "@/lib/payments";
import { clearCart, getCart, MAX_QTY_IN_STOCK, saveOrder, type CartView, type ShippingDetails } from "@/lib/store";
import { setServerAttributes, traceApiRoute } from "@/lib/server-telemetry";

interface CheckoutRequest {
  shipping: ShippingDetails;
  cardNumber: string;
}

interface CheckoutError {
  status: number;
  error: string;
  details?: Record<string, string>;
}

function validateCheckout(shipping: ShippingDetails | undefined, cart: CartView): CheckoutError | null {
  if (!shipping?.name || !shipping?.email || !shipping?.address) {
    return { status: 400, error: "missing_shipping_details" };
  }
  if (cart.items.length === 0) return { status: 400, error: "empty_cart" };
  const outOfStock = cart.items.find((i) => i.quantity > MAX_QTY_IN_STOCK);
  if (outOfStock) return { status: 409, error: "out_of_stock", details: { productId: outOfStock.productId } };
  return null;
}

function fail({ status, error, details = {} }: CheckoutError) {
  setServerAttributes({ "shop.error_code": error });
  return NextResponse.json({ error, ...details }, { status });
}

export const POST = traceApiRoute("/api/checkout", async function POST(request: NextRequest) {
  const { cartId } = resolveCartId(request);
  const { shipping, cardNumber }: CheckoutRequest = await request.json();
  const cart = getCart(cartId);

  const invalid = validateCheckout(shipping, cart);
  if (invalid) return fail(invalid);

  try {
    await chargeCard(cardNumber, cart.total);
  } catch (err) {
    if (err instanceof PaymentDeclinedError) {
      return fail({ status: 402, error: "payment_declined", details: { reason: err.message } });
    }
    throw err;
  }

  const order = {
    id: `ord_${crypto.randomUUID().slice(0, 8)}`,
    items: cart.items,
    total: cart.total,
    shipping,
    cardLast4: cardNumber.replace(/\D/g, "").slice(-4),
    createdAt: new Date().toISOString(),
  };
  saveOrder(order);
  clearCart(cartId);

  return NextResponse.json({ orderId: order.id }, { status: 201 });
});
