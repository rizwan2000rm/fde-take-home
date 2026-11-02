import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { getOrder } from "@/lib/store";

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) notFound();

  return (
    <>
      <h1>Thank you, {order.shipping.name}! 🎉</h1>
      <p>
        Order <code>{order.id}</code> is confirmed. A receipt is on its way to {order.shipping.email}.
      </p>
      <ul className="order-items">
        {order.items.map((item) => (
          <li key={item.productId}>
            {item.product.emoji} {item.product.name} × {item.quantity} — {formatPrice(item.lineTotal)}
          </li>
        ))}
      </ul>
      <p className="price">
        Paid {formatPrice(order.total)} with card ending {order.cardLast4}
      </p>
      <Link href="/" className="btn">
        Keep shopping
      </Link>
    </>
  );
}
