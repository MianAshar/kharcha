/**
 * emailOAuth — Gmail and Outlook OAuth helpers.
 *
 * ─── Google setup ─────────────────────────────────────────────────────────────
 * Three client credentials are used:
 *
 * 1. iOS client (type: iOS, bundle ID: com.kharcha.app)
 *    → Used for auth + PKCE exchange on iOS standalone builds.
 *    → Redirect URI registered in Google Console:
 *        com.googleusercontent.apps.105328440332-is9us28rtod6ka9093s70cl0jrlajph0:/oauth2redirect
 *
 * 2. Android client (type: Android, package: com.kharcha.app + SHA-1)
 *    → Used for auth + PKCE exchange on Android standalone builds.
 *    → Google verifies package + SHA-1, not the redirect URI, so any redirect works.
 *
 * 3. Web client (type: Web)
 *    → Fallback for Expo Go / CI. Also set as GOOGLE_OAUTH_CLIENT_ID Edge Function secret
 *      so the server can refresh tokens without a client secret
 *      (native-client refresh tokens are refreshable with client_id only).
 *    → Redirect URI registered in Google Console: kharcha://oauth
 *
 * ─── Microsoft setup ──────────────────────────────────────────────────────────
 *   1. Azure Portal → App registrations → New registration
 *   2. Add redirect URI: kharcha://oauth
 *   3. Add Mail.Read delegated permission
 *   4. Replace MICROSOFT_CLIENT_ID below
 *
 * ─── Edge Function secrets ────────────────────────────────────────────────────
 *   GOOGLE_OAUTH_CLIENT_ID  — set to the Web client ID below (server-side refresh)
 *   MICROSOFT_OAUTH_CLIENT_ID — same as MICROSOFT_CLIENT_ID below
 */

import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * Returns true when the app is running inside Expo Go (the store client).
 * Google OAuth does NOT work in Expo Go because makeRedirectUri() generates
 * an exp://IP:port URI that changes per machine and cannot be registered
 * in Google Console. A development build (npx expo run:ios / run:android)
 * is required.
 */
export function isRunningInExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

// ── Google client IDs ─────────────────────────────────────────────────────────

export const GOOGLE_IOS_CLIENT_ID =
  '105328440332-is9us28rtod6ka9093s70cl0jrlajph0.apps.googleusercontent.com';

export const GOOGLE_ANDROID_CLIENT_ID =
  '105328440332-s34gf1e9lknrroqsobi7n51gu8iunia0.apps.googleusercontent.com';

/** Web client ID — used as Expo Go fallback and for Edge Function token refresh. */
export const GOOGLE_WEB_CLIENT_ID =
  '105328440332-6e85m2dh2q6uelm0bomj3pjiqhr718fo.apps.googleusercontent.com';

export const MICROSOFT_CLIENT_ID = 'YOUR_MICROSOFT_CLIENT_ID';

// ── Discovery documents ───────────────────────────────────────────────────────
// Using expo-auth-session's Google discovery document (openid-configuration).

export const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const MICROSOFT_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint:
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

export function getOAuthRedirectUri(): string {
  return AuthSession.makeRedirectUri({ native: 'kharcha://oauth' });
}

// ── Server-side Gmail OAuth URL ───────────────────────────────────────────────
// Tokens are exchanged in the gmail-oauth-callback Edge Function (server-side),
// so we can use the Web client with an HTTPS redirect URI — no Android client
// type or custom URI scheme toggle needed.

const GMAIL_SERVER_CALLBACK =
  'https://jvpkqiiycmpcelxqtact.supabase.co/functions/v1/gmail-oauth-callback';

export function buildGmailServerAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID,
    redirect_uri: GMAIL_SERVER_CALLBACK,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'select_account consent',
    state: userId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Resolve the active Google client ID for the current platform ──────────────
// iOS     → iOS native client (reversed-client-ID redirect)
// Android → Android native client (validated by package name + SHA-1, not URI)
// default → Web client (Expo Go fallback, blocked at runtime anyway)

function activeGoogleClientId(): string {
  return Platform.select({
    ios: GOOGLE_IOS_CLIENT_ID,
    android: GOOGLE_ANDROID_CLIENT_ID,
    default: GOOGLE_WEB_CLIENT_ID,
  });
}

// ── Token storage type ────────────────────────────────────────────────────────

export interface StoredToken {
  access_token: string;
  refresh_token: string | null;
  /** Unix ms timestamp when the access_token expires. */
  expires_at: number;
  /** The OAuth client_id used to obtain these tokens. Stored so the Edge
   *  Function can refresh using the same client (native clients refresh
   *  without a client_secret via PKCE). */
  client_id: string;
}

// ── Auth request configs (passed to useAuthRequest hook) ──────────────────────

export function getGmailRequestConfig(): AuthSession.AuthRequestConfig {
  return {
    clientId: activeGoogleClientId(),
    scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    redirectUri: getGmailRedirectUri(),
    // 'select_account consent': shows the account picker every time (even when
    // one account is already signed in) and forces the consent screen so Google
    // always returns a refresh token.
    extraParams: { access_type: 'offline', prompt: 'select_account consent' },
  };
}

export function getOutlookRequestConfig(): AuthSession.AuthRequestConfig {
  return {
    clientId: MICROSOFT_CLIENT_ID,
    scopes: ['openid', 'email', 'Mail.Read', 'offline_access'],
    redirectUri: getOAuthRedirectUri(),
  };
}

// ── Token exchange ────────────────────────────────────────────────────────────

export async function exchangeGmailCode(
  code: string,
  codeVerifier: string | undefined
): Promise<StoredToken> {
  const clientId = activeGoogleClientId();
  const res = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri: getGmailRedirectUri(),
      extraParams: codeVerifier ? { code_verifier: codeVerifier } : undefined,
    },
    GOOGLE_DISCOVERY
  );
  return {
    access_token: res.accessToken,
    refresh_token: res.refreshToken ?? null,
    expires_at: (res.issuedAt + (res.expiresIn ?? 3600)) * 1000,
    client_id: clientId,
  };
}

export async function exchangeOutlookCode(
  code: string,
  codeVerifier: string | undefined
): Promise<StoredToken> {
  const res = await AuthSession.exchangeCodeAsync(
    {
      clientId: MICROSOFT_CLIENT_ID,
      code,
      redirectUri: getOAuthRedirectUri(),
      extraParams: codeVerifier ? { code_verifier: codeVerifier } : undefined,
    },
    MICROSOFT_DISCOVERY
  );
  return {
    access_token: res.accessToken,
    refresh_token: res.refreshToken ?? null,
    expires_at: (res.issuedAt + (res.expiresIn ?? 3600)) * 1000,
    client_id: MICROSOFT_CLIENT_ID,
  };
}

// ── Fetch authenticated user email address ────────────────────────────────────

export async function fetchGmailUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google user info');
  const data = await res.json();
  if (!data.email) throw new Error('Google did not return an email address');
  return data.email as string;
}

export async function fetchOutlookUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch Microsoft user info');
  const data = await res.json();
  return (data.mail ?? data.userPrincipalName) as string;
}

// ── Database helpers ──────────────────────────────────────────────────────────

export async function storeEmailConnection(
  userId: string,
  provider: 'gmail' | 'outlook',
  emailAddress: string,
  token: StoredToken
): Promise<void> {
  const { data: existing } = await supabase
    .from('connected_emails')
    .select('id')
    .eq('user_id', userId)
    .eq('email_address', emailAddress)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('connected_emails')
      .update({
        oauth_token_encrypted: JSON.stringify(token),
        is_active: true,
        last_polled_at: null,
      })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('connected_emails').insert({
      user_id: userId,
      provider,
      email_address: emailAddress,
      oauth_token_encrypted: JSON.stringify(token),
      is_active: true,
      last_polled_at: null,
    });
    if (error) throw error;
  }
}

export async function disconnectEmail(emailId: string): Promise<void> {
  const { error } = await supabase
    .from('connected_emails')
    .delete()
    .eq('id', emailId);
  if (error) throw error;
}
