import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { formatPrice, getProduct } from "@/lib/products";

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();

  return (
    <article className="product">
      <Link href="/" className="back">
        ← Back to shop
      </Link>
      <div className="product-body">
        <div className="thumb large">{product.emoji}</div>
        <div>
          <h1>{product.name}</h1>
          <p className="muted">{product.category}</p>
          <p>{product.description}</p>
          <p className="price">{formatPrice(product.price)}</p>
          <AddToCartButton productId={product.id} />
        </div>
      </div>
    </article>
  );
}
