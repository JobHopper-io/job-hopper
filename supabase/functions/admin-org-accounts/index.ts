// Admin-only backend for bulk licensing / org accounts (Build 10-11): converting an
// institutional lead into a paid, seat-based org account, CSV seat import (hard-stopped
// at purchased capacity), and per-seat revoke. One file dispatched by `action`, same
// shape as admin-trial-grants -- all three only ever serve the org-account panel on
// /admin/partner-dashboard/:leadId.
//
// Real Stripe writes: this creates/updates a real Stripe subscription (quantity = seat
// count, Stripe's own seat-billing primitive -- no custom seat-pricing math) using
// collection_method='send_invoice' so a purchase never requires collecting a card in an
// admin panel. Hard-aborts before writing anything if the resolved Stripe key turns out
// to be live-mode (see assertTestMode) -- this account has zero real paying institutional
// customers yet, so a live-mode object here would always be a bug, never intended.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import Stripe from "npm:stripe@14.21.0"
import { getStripeProductId } from "../_shared/stripe-products.ts"
import { sendEmail } from "../_shared/email.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const VALID_TIERS = new Set(["core", "premium"])
const DAYS_UNTIL_DUE = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface RequestBody {
  action?: "create_org_account" | "import_seats" | "revoke_seat" | "get_stripe_status"
  leadId?: string
  organizationName?: string
  billingEmail?: string
  billingName?: string
  featureTier?: string
  seatCount?: number
  orgAccountId?: string
  emails?: string[]
  email?: string
}

function mapStripeStatus(stripeStatus: string): "trial" | "active" | "past_due" | "canceled" {
  if (stripeStatus === "trialing") return "trial"
  if (stripeStatus === "active") return "active"
  if (stripeStatus === "past_due") return "past_due"
  return "canceled"
}

// Cheap read-only call before any write: Stripe stamps every object (including a
// balance read) with `livemode`. Aborting here means a misconfigured secret can never
// result in a real institutional org getting a real live-mode subscription by accident.
async function assertTestMode(): Promise<void> {
  const balance = await stripe.balance.retrieve()
  if (balance.livemode) {
    throw new Error(
      "Refusing to create/modify an org account subscription: the configured Stripe key is LIVE mode, not test mode.",
    )
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    })
  }

  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    const [{ data: isAdmin, error: adminError }, { data: isSuperAdmin, error: superAdminError }] =
      await Promise.all([
        userClient.rpc("current_user_has_role", { role_name: "admin" }),
        userClient.rpc("current_user_has_role", { role_name: "super_admin" }),
      ])

    if (adminError || superAdminError) {
      console.error("admin-org-accounts: role check failed", adminError ?? superAdminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    // -----------------------------------------------------------------
    // get_stripe_status: real Stripe read (quantity, status, livemode) for an org's
    // subscription -- lets an admin (or a verification script) check ground truth
    // against Stripe directly rather than trusting only what's mirrored in Supabase.
    // -----------------------------------------------------------------
    if (body.action === "get_stripe_status") {
      const orgAccountId = (body.orgAccountId ?? "").trim()
      if (!orgAccountId) {
        return new Response(JSON.stringify({ error: "Missing orgAccountId." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }
      const { data: org, error: orgError } = await serviceClient
        .from("org_accounts")
        .select("subscription_id")
        .eq("id", orgAccountId)
        .maybeSingle()
      if (orgError || !org?.subscription_id) {
        return new Response(JSON.stringify({ error: "Org account or subscription not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        })
      }
      const { data: subRow, error: subRowError } = await serviceClient
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("id", org.subscription_id)
        .maybeSingle()
      if (subRowError || !subRow) {
        return new Response(JSON.stringify({ error: "Subscription row not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        })
      }
      const stripeSubscription = await stripe.subscriptions.retrieve(subRow.stripe_subscription_id)
      const item = stripeSubscription.items.data[0]
      return new Response(
        JSON.stringify({
          stripeSubscriptionId: stripeSubscription.id,
          livemode: stripeSubscription.livemode,
          status: stripeSubscription.status,
          collectionMethod: stripeSubscription.collection_method,
          quantity: item?.quantity ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    // -----------------------------------------------------------------
    // create_org_account
    // -----------------------------------------------------------------
    if (body.action === "create_org_account") {
      const leadId = (body.leadId ?? "").trim()
      const organizationName = (body.organizationName ?? "").trim().slice(0, 200)
      const billingEmail = (body.billingEmail ?? "").trim().toLowerCase()
      const billingName = (body.billingName ?? "").trim().slice(0, 200)
      const featureTier = (body.featureTier ?? "").trim()
      const seatCount = Number(body.seatCount)

      if (!organizationName) {
        return new Response(JSON.stringify({ error: "An organization name is required." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }
      if (!EMAIL_RE.test(billingEmail)) {
        return new Response(JSON.stringify({ error: "A valid billing contact email is required." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }
      if (!VALID_TIERS.has(featureTier)) {
        return new Response(JSON.stringify({ error: "Feature tier must be core or premium." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }
      if (!Number.isInteger(seatCount) || seatCount < 1) {
        return new Response(JSON.stringify({ error: "Seat count must be a positive integer." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }

      await assertTestMode()

      // Find-or-create the billing-contact profile. This is a billing anchor, not a
      // login: auth_user_id is nullable specifically for this case (see profiles
      // schema) -- an institutional decision-maker who signs a contract is a customer,
      // not necessarily ever a job-seeker who creates a dashboard account.
      const { data: existingProfile, error: existingProfileError } = await serviceClient
        .from("profiles")
        .select("id, stripe_customer_id")
        .eq("email", billingEmail)
        .limit(1)
        .maybeSingle()

      if (existingProfileError) {
        console.error("admin-org-accounts: billing profile lookup failed", existingProfileError)
        return new Response(JSON.stringify({ error: "Failed to look up billing contact." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        })
      }

      let billingProfileId: string
      let stripeCustomerId: string | null

      if (existingProfile) {
        billingProfileId = existingProfile.id
        stripeCustomerId = existingProfile.stripe_customer_id
      } else {
        const [firstName, ...rest] = billingName.split(/\s+/).filter(Boolean)
        const { data: created, error: createError } = await serviceClient
          .from("profiles")
          .insert({
            email: billingEmail,
            first_name: firstName ?? "",
            last_name: rest.join(" "),
          })
          .select("id, stripe_customer_id")
          .single()

        if (createError || !created) {
          console.error("admin-org-accounts: failed to create billing profile", createError)
          return new Response(JSON.stringify({ error: "Failed to create billing contact." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
          })
        }
        billingProfileId = created.id
        stripeCustomerId = created.stripe_customer_id
      }

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: billingEmail,
          name: billingName || organizationName,
          metadata: { supabase_profile_id: billingProfileId, org_account: "true" },
        })
        stripeCustomerId = customer.id
        const { error: updateCustomerError } = await serviceClient
          .from("profiles")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", billingProfileId)
        if (updateCustomerError) {
          console.error("admin-org-accounts: failed to persist stripe_customer_id", updateCustomerError)
        }
      }

      const { data: product, error: productError } = await serviceClient
        .from("products")
        .select("id, key, display_name, price_cents, category, stripe_product_id")
        .eq("key", featureTier)
        .eq("category", "base_plan")
        .single()

      if (productError || !product) {
        console.error("admin-org-accounts: base plan product not found", productError)
        return new Response(JSON.stringify({ error: "Could not find that base plan product." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        })
      }

      const stripeProductId = await getStripeProductId(product)

      const stripeSubscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: product.price_cents,
              product: stripeProductId,
              recurring: { interval: "month" },
            },
            quantity: seatCount,
          },
        ],
        collection_method: "send_invoice",
        days_until_due: DAYS_UNTIL_DUE,
        metadata: {
          org_account: "true",
          institutional_lead_id: leadId || "",
          organization_name: organizationName,
        },
      })

      const subscriptionStatus = mapStripeStatus(stripeSubscription.status)
      const currentPeriodEnd = stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : null

      const { data: subRow, error: subInsertError } = await serviceClient
        .from("subscriptions")
        .insert({
          stripe_subscription_id: stripeSubscription.id,
          profile_id: billingProfileId,
          status: subscriptionStatus,
          current_period_ends_at: currentPeriodEnd,
        })
        .select("id")
        .single()

      if (subInsertError || !subRow) {
        console.error("admin-org-accounts: failed to insert subscriptions row", subInsertError)
        return new Response(
          JSON.stringify({ error: "Stripe subscription created but failed to record it. Check Stripe dashboard." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
        )
      }

      const item = stripeSubscription.items.data[0]
      const { error: subProductError } = await serviceClient
        .from("subscription_product")
        .insert({
          subscription_id: subRow.id,
          product_id: product.id,
          stripe_subscription_item_id: item?.id ?? null,
        })
      if (subProductError) {
        console.error("admin-org-accounts: failed to insert subscription_product row", subProductError)
      }

      const { data: orgAccount, error: orgInsertError } = await serviceClient
        .from("org_accounts")
        .insert({
          institutional_lead_id: leadId || null,
          organization_name: organizationName,
          billing_profile_id: billingProfileId,
          subscription_id: subRow.id,
          feature_tier: featureTier,
          seat_count: seatCount,
          created_by: user.id,
        })
        .select("id, organization_name, feature_tier, seat_count, seats_used, status, subscription_id, created_at")
        .single()

      if (orgInsertError || !orgAccount) {
        console.error("admin-org-accounts: failed to insert org_accounts row", orgInsertError)
        return new Response(
          JSON.stringify({ error: "Stripe subscription created but failed to record the org account." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
        )
      }

      return new Response(
        JSON.stringify({
          orgAccount,
          stripeSubscriptionId: stripeSubscription.id,
          stripeSubscriptionStatus: stripeSubscription.status,
          stripeSubscriptionQuantity: item?.quantity ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    // -----------------------------------------------------------------
    // import_seats
    // -----------------------------------------------------------------
    if (body.action === "import_seats") {
      const orgAccountId = (body.orgAccountId ?? "").trim()
      const rawEmails = Array.isArray(body.emails) ? body.emails : []

      if (!orgAccountId) {
        return new Response(JSON.stringify({ error: "Missing orgAccountId." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }

      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
            .filter((e) => EMAIL_RE.test(e)),
        ),
      )

      if (emails.length === 0) {
        return new Response(JSON.stringify({ error: "No valid email addresses in the upload." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }

      const { data: org, error: orgError } = await serviceClient
        .from("org_accounts")
        .select("id, organization_name, feature_tier, seat_count, seats_used, status")
        .eq("id", orgAccountId)
        .maybeSingle()

      if (orgError || !org) {
        return new Response(JSON.stringify({ error: "Org account not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        })
      }
      if (org.status !== "active") {
        return new Response(JSON.stringify({ error: "This org account is not active." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409,
        })
      }

      // Already-invited (unrevoked) emails don't consume a second seat on re-upload --
      // only genuinely new names count against remaining capacity.
      const { data: existingInvites, error: existingInvitesError } = await serviceClient
        .from("org_seat_invites")
        .select("email")
        .eq("org_account_id", orgAccountId)
        .is("revoked_at", null)

      if (existingInvitesError) {
        console.error("admin-org-accounts: failed to load existing invites", existingInvitesError)
        return new Response(JSON.stringify({ error: "Failed to check existing seat invites." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        })
      }

      const existingSet = new Set((existingInvites ?? []).map((r) => r.email.toLowerCase()))
      const newEmails = emails.filter((e) => !existingSet.has(e))
      const alreadyInvited = emails.filter((e) => existingSet.has(e))

      const remainingSeats = org.seat_count - org.seats_used
      if (newEmails.length > remainingSeats) {
        // Hard stop -- reject the whole upload, no partial provisioning. Seat overage
        // is a billing/contract problem, not a UX one to smooth over.
        return new Response(
          JSON.stringify({
            error: `This upload needs ${newEmails.length} new seat(s) but only ${remainingSeats} of ${org.seat_count} purchased seats remain.`,
            requested: newEmails.length,
            remaining: remainingSeats,
            seatCount: org.seat_count,
            seatsUsed: org.seats_used,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 },
        )
      }

      if (newEmails.length > 0) {
        const { error: insertInvitesError } = await serviceClient
          .from("org_seat_invites")
          .insert(newEmails.map((email) => ({ org_account_id: orgAccountId, email })))

        if (insertInvitesError) {
          console.error("admin-org-accounts: failed to insert seat invites", insertInvitesError)
          return new Response(JSON.stringify({ error: "Failed to record seat invites." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
          })
        }

        const { error: seatsUpdateError } = await serviceClient
          .from("org_accounts")
          .update({ seats_used: org.seats_used + newEmails.length })
          .eq("id", orgAccountId)

        if (seatsUpdateError) {
          console.error("admin-org-accounts: failed to update seats_used", seatsUpdateError)
        }
      }

      // Best-effort invite emails -- a failed send here doesn't roll back the seat
      // reservation (mirrors how a bounced/failed outbound send never un-reserves
      // anything elsewhere in this codebase); the row exists and will still auto-link
      // when that person signs up with this email, invite or no invite.
      const tierLabel = org.feature_tier === "premium" ? "Premium" : "Core"
      const siteUrl = Deno.env.get("SITE_URL") || "https://job-hopper.io"
      let emailsSent = 0
      for (const email of [...newEmails, ...alreadyInvited]) {
        const result = await sendEmail({
          to: email,
          subject: `You're invited to Job-Hopper via ${org.organization_name}`,
          text: `${org.organization_name} has set you up with ${tierLabel} access on Job-Hopper.\n\nCreate your account with this email address (${email}) to activate it: ${siteUrl}/register\n\nJob-Hopper`,
          html: `<p>${org.organization_name} has set you up with ${tierLabel} access on Job-Hopper.</p><p>Create your account with this email address (${email}) to activate it: <a href="${siteUrl}/register">${siteUrl}/register</a></p><p>Job-Hopper</p>`,
          category: "org_seat_invite",
        })
        if (result.success) emailsSent += 1
      }

      return new Response(
        JSON.stringify({
          invited: newEmails.length,
          alreadyInvited: alreadyInvited.length,
          emailsSent,
          seatsUsed: org.seats_used + newEmails.length,
          seatCount: org.seat_count,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    // -----------------------------------------------------------------
    // revoke_seat
    // -----------------------------------------------------------------
    if (body.action === "revoke_seat") {
      const orgAccountId = (body.orgAccountId ?? "").trim()
      const email = (body.email ?? "").trim().toLowerCase()

      if (!orgAccountId || !email) {
        return new Response(JSON.stringify({ error: "Missing orgAccountId or email." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }

      const { data: org, error: orgError } = await serviceClient
        .from("org_accounts")
        .select("id, seat_count, seats_used, subscription_id")
        .eq("id", orgAccountId)
        .maybeSingle()

      if (orgError || !org) {
        return new Response(JSON.stringify({ error: "Org account not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        })
      }

      const { data: invite, error: inviteError } = await serviceClient
        .from("org_seat_invites")
        .select("id")
        .eq("org_account_id", orgAccountId)
        .eq("email", email)
        .is("revoked_at", null)
        .maybeSingle()

      if (inviteError || !invite) {
        return new Response(JSON.stringify({ error: "No active seat invite for that email." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        })
      }

      await assertTestMode()

      const newSeatCount = Math.max(1, org.seat_count - 1)

      if (org.subscription_id) {
        const { data: subRow, error: subRowError } = await serviceClient
          .from("subscriptions")
          .select("stripe_subscription_id")
          .eq("id", org.subscription_id)
          .maybeSingle()

        if (subRowError || !subRow) {
          console.error("admin-org-accounts: could not load subscription for revoke", subRowError)
          return new Response(JSON.stringify({ error: "Failed to load org subscription." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
          })
        }

        const stripeSubscription = await stripe.subscriptions.retrieve(subRow.stripe_subscription_id)
        const item = stripeSubscription.items.data[0]
        if (item) {
          await stripe.subscriptions.update(subRow.stripe_subscription_id, {
            items: [{ id: item.id, quantity: newSeatCount }],
            proration_behavior: "create_prorations",
          })
        }
      }

      const { error: revokeError } = await serviceClient
        .from("org_seat_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", invite.id)

      if (revokeError) {
        console.error("admin-org-accounts: failed to mark invite revoked", revokeError)
        return new Response(JSON.stringify({ error: "Failed to revoke seat invite." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        })
      }

      const { error: seatCountError } = await serviceClient
        .from("org_accounts")
        .update({ seat_count: newSeatCount, seats_used: Math.max(0, org.seats_used - 1) })
        .eq("id", orgAccountId)

      if (seatCountError) {
        console.error("admin-org-accounts: failed to update org_accounts seat counts", seatCountError)
      }

      // Immediate access cutoff for anyone already linked under that email, independent
      // of whether/when they'd have shown up in a future reconciliation pass.
      const { error: unlinkError } = await serviceClient
        .from("profiles")
        .update({ org_account_id: null })
        .eq("org_account_id", orgAccountId)
        .ilike("email", email)

      if (unlinkError) {
        console.error("admin-org-accounts: failed to unlink profile on revoke", unlinkError)
      }

      return new Response(
        JSON.stringify({ revoked: email, seatCount: newSeatCount, seatsUsed: Math.max(0, org.seats_used - 1) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    return new Response(JSON.stringify({ error: "Unrecognized action." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    })
  } catch (error) {
    console.error("admin-org-accounts: unexpected error", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    })
  }
})
