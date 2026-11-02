// In-memory "backend" for the demo store. State lives on globalThis so it
// survives module reloads in `next dev`. Nothing here is persisted.
import { getProduct, type Product } from "./products";

export const MAX_QTY_IN_STOCK = 5;

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartView {
  items: (CartLine & { product: Product; lineTotal: number })[];
  itemCount: number;
  total: number;
}

export interface ShippingDetails {
  name: string;
  email: string;
  address: string;
}

export interface Order {
  id: string;
  items: CartView["items"];
  total: number;
  shipping: ShippingDetails;
  cardLast4: string;
  createdAt: string;
}

interface StoreState {
  carts: Map<string, CartLine[]>;
  orders: Map<string, Order>;
}

const globalStore = globalThis as unknown as { __shopStore?: StoreState };
const state: StoreState = (globalStore.__shopStore ??= {
  carts: new Map(),
  orders: new Map(),
});

export function getCart(cartId: string): CartView {
  const lines = state.carts.get(cartId) ?? [];
  const items = lines.flatMap((line) => {
    const product = getProduct(line.productId);
    return product
      ? [{ ...line, product, lineTotal: product.price * line.quantity }]
      : [];
  });
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    total: items.reduce((n, i) => n + i.lineTotal, 0),
  };
}

export function addToCart(cartId: string, productId: string, quantity: number) {
  const lines = state.carts.get(cartId) ?? [];
  const existing = lines.find((l) => l.productId === productId);
  if (existing) existing.quantity += quantity;
  else lines.push({ productId, quantity });
  state.carts.set(cartId, lines);
}

export function setCartQuantity(cartId: string, productId: string, quantity: number) {
  const lines = (state.carts.get(cartId) ?? []).filter((l) => l.productId !== productId);
  if (quantity > 0) lines.push({ productId, quantity });
  state.carts.set(cartId, lines);
}

export function clearCart(cartId: string) {
  state.carts.delete(cartId);
}

export function saveOrder(order: Order) {
  state.orders.set(order.id, order);
}

export function getOrder(id: string): Order | undefined {
  return state.orders.get(id);
}
