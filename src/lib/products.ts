export type Category = "apparel" | "electronics" | "home";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  category: Category;
  emoji: string;
}

export const CATEGORIES: Category[] = ["apparel", "electronics", "home"];

export const PRODUCTS: Product[] = [
  {
    id: "otel-hoodie",
    name: "Telemetry Hoodie",
    description: "Heavyweight hoodie for long on-call nights.",
    price: 5900,
    category: "apparel",
    emoji: "🧥",
  },
  {
    id: "trace-tee",
    name: "Distributed Trace Tee",
    description: "Soft cotton tee printed with a waterfall of spans.",
    price: 2400,
    category: "apparel",
    emoji: "👕",
  },
  {
    id: "span-cap",
    name: "Span Cap",
    description: "Keeps the sun off while you watch p99s.",
    price: 1900,
    category: "apparel",
    emoji: "🧢",
  },
  {
    id: "metrics-keyboard",
    name: "Mechanical Keyboard",
    description: "Tactile switches, loud enough to wake the pager.",
    price: 12900,
    category: "electronics",
    emoji: "⌨️",
  },
  {
    id: "latency-headphones",
    name: "Low-Latency Headphones",
    description: "Wireless headphones with sub-40ms audio latency.",
    price: 19900,
    category: "electronics",
    emoji: "🎧",
  },
  {
    id: "dashboard-monitor",
    name: "27\" Dashboard Monitor",
    description: "Enough pixels for all twelve Grafana panels.",
    price: 32900,
    category: "electronics",
    emoji: "🖥️",
  },
  {
    id: "incident-mug",
    name: "Incident Commander Mug",
    description: "Holds 400ml of coffee. Rated for SEV-1s.",
    price: 1500,
    category: "home",
    emoji: "☕",
  },
  {
    id: "alert-lamp",
    name: "Alert Lamp",
    description: "Desk lamp that glows red when things go sideways.",
    price: 4500,
    category: "home",
    emoji: "💡",
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
