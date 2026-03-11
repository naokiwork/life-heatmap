/**
 * auth.ts
 *
 * Replit OIDC + JWT implementation for Cloudflare Workers.
 *
 * Flow:
 *  1. /api/login  → redirect to Replit with PKCE
 *  2. /api/callback → exchange code, verify id_token, upsert user in Supabase,
 *                     issue our own signed JWT, redirect to Pages with #token=...
 *  3. Every protected request → verifyToken(jwt)
 *
 * SERVER-ONLY — API keys and secrets NEVER leave this file to the client.
 */

import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── PKCE helpers (Web Crypto API — works in Workers) ────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeVerifier(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return base64url(bytes.buffer);
}

async function sha256Base64Url(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(str));
  return base64url(digest);
}

function randomState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

// ─── OIDC discovery (cached per-request) ─────────────────────────────────────

let _discovery: Record<string, string> | null = null;

async function getDiscovery(): Promise<Record<string, string>> {
  if (_discovery) return _discovery;
  const r = await fetch("https://replit.com/oidc/.well-known/openid-configuration");
  if (!r.ok) throw new Error("Failed to fetch OIDC discovery document");
  _discovery = await r.json();
  return _discovery!;
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface AppClaims {
  sub: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  tier: string;
}

function jwtSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueAppJwt(
  claims: AppClaims,
  secret: string
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret(secret));
}

export async function verifyAppJwt(
  token: string,
  secret: string
): Promise<AppClaims> {
  const { payload } = await jwtVerify(token, jwtSecret(secret));
  return payload as unknown as AppClaims;
}

// ─── OIDC login redirect ──────────────────────────────────────────────────────

export interface LoginOptions {
  clientId: string;
  callbackUrl: string;
  /** KV namespace to store PKCE verifier temporarily */
  kv: KVNamespace;
}

export async function buildLoginRedirect(opts: LoginOptions): Promise<Response> {
  const { clientId, callbackUrl, kv } = opts;
  const discovery = await getDiscovery();
  const state = randomState();
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await sha256Base64Url(codeVerifier);

  // Store verifier keyed by state with a 5-min TTL
  await kv.put(`pkce:${state}`, codeVerifier, { expirationTtl: 300 });

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile offline_access");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login consent");

  return Response.redirect(url.toString(), 302);
}

// ─── OIDC callback handler ────────────────────────────────────────────────────

export interface CallbackOptions {
  clientId: string;
  callbackUrl: string;
  jwtSecret: string;
  frontendOrigin: string;
  kv: KVNamespace;
  supabase: SupabaseClient;
  code: string;
  state: string;
}

export async function handleCallback(opts: CallbackOptions): Promise<Response> {
  const {
    clientId, callbackUrl, jwtSecret: secret,
    frontendOrigin, kv, supabase, code, state,
  } = opts;

  // Retrieve PKCE verifier
  const codeVerifier = await kv.get(`pkce:${state}`);
  if (!codeVerifier) {
    return new Response("Invalid or expired state parameter", { status: 400 });
  }
  await kv.delete(`pkce:${state}`);

  const discovery = await getDiscovery();

  // Exchange code for tokens
  const tokenRes = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[auth] token exchange failed:", body);
    return Response.redirect(`${frontendOrigin}/?error=auth_failed`, 302);
  }

  const tokens = await tokenRes.json() as {
    id_token: string;
    access_token: string;
    refresh_token?: string;
  };

  // Verify id_token signature using Replit's JWKS
  const JWKS = createRemoteJWKSet(new URL(discovery.jwks_uri));
  let idClaims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(tokens.id_token, JWKS, {
      issuer: "https://replit.com/oidc",
      audience: clientId,
    });
    idClaims = payload as Record<string, unknown>;
  } catch (e) {
    console.error("[auth] id_token verification failed:", (e as Error).message);
    return Response.redirect(`${frontendOrigin}/?error=auth_failed`, 302);
  }

  const userId = idClaims.sub as string;
  const email = idClaims.email as string | undefined;
  const firstName = (idClaims.first_name ?? idClaims.given_name) as string | undefined;
  const lastName = (idClaims.last_name ?? idClaims.family_name) as string | undefined;
  const profileImageUrl = idClaims.profile_image_url as string | undefined;

  // Upsert user in Supabase (service role key is server-only)
  const { data: upserted } = await supabase
    .from("users")
    .upsert(
      { id: userId, email, first_name: firstName, last_name: lastName, profile_image_url: profileImageUrl, tier: "free", subscription_status: "inactive", updated_at: new Date().toISOString() },
      { onConflict: "id", ignoreDuplicates: false }
    )
    .select("tier")
    .single();

  const tier = upserted?.tier ?? "free";

  // Issue our own signed JWT
  const appJwt = await issueAppJwt(
    { sub: userId, email, firstName, lastName, profileImageUrl, tier },
    secret
  );

  // Redirect to frontend with token in URL fragment (never hits server logs)
  return Response.redirect(`${frontendOrigin}/#token=${appJwt}`, 302);
}
