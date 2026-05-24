import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
const stripeWebhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const stripe = new Stripe(stripeSecretKey, {
  httpClient: Stripe.createFetchHttpClient(),
});

function toIsoOrNull(unixSeconds?: number | null): string | null {
  if (!unixSeconds) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

function amountToDecimalOrNull(amountInCents?: number | null): number | null {
  if (amountInCents === null || amountInCents === undefined) {
    return null;
  }
  return Number((amountInCents / 100).toFixed(2));
}

function normalizeSubscriptionStatus(status?: string | null): string {
  if (!status) {
    return "active";
  }

  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "active",
    past_due: "past_due",
    unpaid: "past_due",
    incomplete: "pending",
    incomplete_expired: "canceled",
    canceled: "canceled",
    paused: "paused",
  };

  return statusMap[status] ?? status;
}

function isUuid(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

async function resolveAppUserId(rawUserId?: string | null): Promise<string | null> {
  const candidate = (rawUserId ?? "").trim();
  if (!candidate) {
    return null;
  }

  if (isUuid(candidate)) {
    const { data: byId, error: byIdError } = await supabase
      .from("users")
      .select("id")
      .eq("id", candidate)
      .limit(1);

    if (byIdError) {
      throw new Error(`users lookup by id failed: ${byIdError.message}`);
    }

    if ((byId ?? [])[0]?.id) {
      return String(byId[0].id);
    }
  }

  const { data: byClerk, error: byClerkError } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", candidate)
    .limit(1);

  if (byClerkError) {
    throw new Error(`users lookup by clerk_id failed: ${byClerkError.message}`);
  }

  if ((byClerk ?? [])[0]?.id) {
    return String(byClerk[0].id);
  }

  return null;
}

function inferPlanType(
  subscription: Stripe.Subscription,
  metadata: Record<string, string>
): "all_access_monthly" | "all_access_annual" {
  const explicit = metadata.plan_type;
  if (explicit === "all_access_monthly" || explicit === "all_access_annual") {
    return explicit;
  }

  const firstItem = subscription.items?.data?.[0];
  const interval = firstItem?.price?.recurring?.interval;
  if (interval === "year") {
    return "all_access_annual";
  }

  return "all_access_monthly";
}

async function upsertSubscriptionFromStripeSubscription(
  subscription: Stripe.Subscription,
  userIdFallback?: string | null
): Promise<{ updated: boolean; reason?: string; stripe_subscription_id?: string; status?: string }> {
  const metadata = (subscription.metadata ?? {}) as Record<string, string>;
  const userId = await resolveAppUserId(metadata.user_id ?? userIdFallback ?? null);

  if (!userId) {
    return {
      updated: false,
      reason: "Subscription metadata missing resolvable user_id",
    };
  }

  const payload = {
    user_id: userId,
    plan_type: inferPlanType(subscription, metadata),
    stripe_subscription_id: subscription.id,
    status: normalizeSubscriptionStatus(subscription.status),
    current_period_start: toIsoOrNull(subscription.current_period_start),
    current_period_end: toIsoOrNull(subscription.current_period_end),
  };

  const { error } = await supabase
    .from("user_subscriptions")
    .upsert(payload, { onConflict: "stripe_subscription_id" });

  if (error) {
    throw new Error(`user_subscriptions upsert failed: ${error.message}`);
  }

  return {
    updated: true,
    stripe_subscription_id: subscription.id,
    status: payload.status,
  };
}

async function upsertPurchaseFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<Record<string, unknown>> {
  const metadata = (session.metadata ?? {}) as Record<string, string>;
  const userId = await resolveAppUserId(
    metadata.user_id ?? session.client_reference_id ?? null
  );
  const coursePackId = metadata.course_pack_id ?? null;

  if (!userId || !coursePackId) {
    return {
      updated: false,
      reason: "Session metadata missing resolvable user_id or course_pack_id",
    };
  }

  const payload = {
    user_id: userId,
    course_pack_id: coursePackId,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    amount_paid: amountToDecimalOrNull(session.amount_total),
    currency: session.currency ?? "usd",
    status: session.payment_status === "paid" ? "completed" : "pending",
  };

  const { error } = await supabase
    .from("user_purchases")
    .upsert(payload, { onConflict: "user_id,course_pack_id" });

  if (error) {
    throw new Error(`user_purchases upsert failed: ${error.message}`);
  }

  const result: Record<string, unknown> = {
    updated: true,
    course_pack_id: coursePackId,
    status: payload.status,
    checkout_session_id: session.id,
  };

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (session.mode === "subscription" && subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (!subscription.metadata?.user_id && userId) {
      subscription.metadata = {
        ...(subscription.metadata ?? {}),
        user_id: userId,
      } as Stripe.Metadata;
    }

    result.subscription = await upsertSubscriptionFromStripeSubscription(
      subscription,
      userId
    );
  }

  return result;
}

async function handleStripeEvent(event: Stripe.Event): Promise<Record<string, unknown>> {
  if (event.type === "checkout.session.completed") {
    const eventSession = event.data.object as Stripe.Checkout.Session;

    // Retrieve canonical Stripe session payload to avoid relying on partial event object.
    const checkoutSession = await stripe.checkout.sessions.retrieve(eventSession.id, {
      expand: ["subscription", "payment_intent"],
    });

    return upsertPurchaseFromCheckoutSession(checkoutSession);
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    return upsertSubscriptionFromStripeSubscription(subscription);
  }

  if (event.type === "customer.subscription.trial_will_end") {
    const subscription = event.data.object as Stripe.Subscription;
    return {
      updated: false,
      reason: "noted, trial ending",
      stripe_subscription_id: subscription.id,
    };
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;

    if (!subscriptionId) {
      return { updated: false, reason: "Invoice missing subscription id" };
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return upsertSubscriptionFromStripeSubscription(subscription);
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;

    if (!subscriptionId) {
      return { updated: false, reason: "Invoice missing subscription id" };
    }

    const { error } = await supabase
      .from("user_subscriptions")
      .update({ status: "past_due" })
      .eq("stripe_subscription_id", subscriptionId);

    if (error) {
      throw new Error(`user_subscriptions update failed: ${error.message}`);
    }

    return {
      updated: true,
      stripe_subscription_id: subscriptionId,
      status: "past_due",
    };
  }

  return { updated: false, reason: `Unhandled event type: ${event.type}` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      stripeWebhookSecret
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Invalid webhook signature: ${(error as Error).message}` }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  try {
    const result = await handleStripeEvent(event);
    return new Response(
      JSON.stringify({
        received: true,
        event_type: event.type,
        result,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Webhook handling failed: ${(error as Error).message}` }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});
