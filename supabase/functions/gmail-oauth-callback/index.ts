import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_WEB_CLIENT_ID =
  "105328440332-6e85m2dh2q6uelm0bomj3pjiqhr718fo.apps.googleusercontent.com";

const REDIRECT_URI =
  "https://jvpkqiiycmpcelxqtact.supabase.co/functions/v1/gmail-oauth-callback";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !userId) {
    console.error("Gmail callback error:", error ?? "missing code or state");
    return Response.redirect("kharcha://oauth?gmail=error", 302);
  }

  try {
    // Exchange authorization code for tokens (server-side, using client secret)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_WEB_CLIENT_ID,
        client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description ?? "Token exchange failed");
    }

    const token = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      client_id: GOOGLE_WEB_CLIENT_ID,
    };

    // Fetch the user's Gmail address
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const userInfo = await userInfoRes.json();
    const emailAddress: string = userInfo.email;
    if (!emailAddress) throw new Error("Google did not return an email address");

    // Upsert into connected_emails
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existing } = await supabase
      .from("connected_emails")
      .select("id")
      .eq("user_id", userId)
      .eq("email_address", emailAddress)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from("connected_emails")
        .update({
          oauth_token_encrypted: JSON.stringify(token),
          is_active: true,
          last_polled_at: null,
        })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from("connected_emails")
        .insert({
          user_id: userId,
          provider: "gmail",
          email_address: emailAddress,
          oauth_token_encrypted: JSON.stringify(token),
          is_active: true,
          last_polled_at: null,
        });
      if (insertErr) throw insertErr;
    }

    return Response.redirect("kharcha://oauth?gmail=success", 302);
  } catch (e) {
    console.error("Gmail OAuth callback failed:", e);
    return Response.redirect("kharcha://oauth?gmail=error", 302);
  }
});
