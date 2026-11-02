// Fake payment provider. Its failure modes are deliberate so the user
// journey has realistic drop-off and latency to observe:
//   - card number ending in 0002          -> always declined
//   - PAYMENT_FAILURE_RATE (default 0.1)  -> random declines
//   - SLOW_PAYMENT_RATE (default 0.1)     -> 3-5s responses instead of 0.2-1s

import { inServerSpan, setServerAttributes } from "./server-telemetry";

export class PaymentDeclinedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PaymentDeclinedError";
  }
}

const failureRate = Number(process.env.PAYMENT_FAILURE_RATE ?? 0.1);
const slowRate = Number(process.env.SLOW_PAYMENT_RATE ?? 0.1);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (min: number, max: number) => min + Math.random() * (max - min);

export async function chargeCard(cardNumber: string, amount: number): Promise<{ transactionId: string }> {
  // This provider is an in-process simulation, so the default INTERNAL kind is
  // appropriate. A real remote provider would get an HTTP CLIENT span instead.
  return inServerSpan("payment.charge", {
    attributes: { "shop.payment.provider": "simulated", "shop.payment.amount_cents": amount },
  }, async () => {
    try {
      const result = await charge(cardNumber, amount);
      setServerAttributes({ "shop.outcome": "success" });
      return result;
    } catch (error) {
      if (error instanceof PaymentDeclinedError) setServerAttributes({ "shop.error_code": error.message });
      throw error;
    }
  });
}

async function charge(cardNumber: string, amount: number): Promise<{ transactionId: string }> {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 12) throw new PaymentDeclinedError("invalid_card_number");
  if (amount <= 0) throw new PaymentDeclinedError("invalid_amount");

  await sleep(Math.random() < slowRate ? between(3000, 5000) : between(200, 1000));

  if (digits.endsWith("0002")) throw new PaymentDeclinedError("card_declined");
  if (Math.random() < failureRate) throw new PaymentDeclinedError("processor_error");

  return { transactionId: `txn_${crypto.randomUUID().slice(0, 8)}` };
}
