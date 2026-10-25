import type Stripe from "stripe";

// Email narrows the provider query. Only server-managed immutable account UUID
// metadata authorizes a customer. Never adopt an unbound/recycled email match.
export function selectBuyerCustomer(result: { data: Stripe.Customer[]; has_more?: boolean }, userId: string) {
  if (result.has_more) throw new Error("Customer bindings require review.");
  const matches = result.data.filter(customer => customer.metadata?.supabaseUserId === userId);
  if (matches.length > 1) throw new Error("Conflicting customer bindings require review.");
  return matches[0] ?? null;
}
