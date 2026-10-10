import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { guardOrganizationAdmin } from "../_shared/edgeAuth.ts";
import { escapeHtml } from "../_shared/htmlEscape.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = new Set(["member", "admin", "owner"]);
const TRUSTED_APP_HOSTS = new Set([
  "app.madisonstudio.io",
  "madisonstudio.io",
  "localhost",
]);

interface InvitationEmailRequest {
  email?: string;
  organizationId?: string;
  organizationName?: string;
  role?: string;
  invitedByName?: string;
  appUrl?: string;
}

function resolveInviteAppUrl(requested: unknown): string {
  const fromEnv = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "https://app.madisonstudio.io")
    .trim()
    .replace(/\/$/, "");
  if (typeof requested !== "string" || !requested.trim()) return fromEnv;
  try {
    const parsed = new URL(requested);
    const host = parsed.hostname.toLowerCase();
    const trusted =
      TRUSTED_APP_HOSTS.has(host) ||
      host.endsWith(".madisonstudio.io") ||
      host === "localhost";
    if (trusted && (parsed.protocol === "https:" || host === "localhost")) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // fall through to the trusted default
  }
  return fromEnv;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as InvitationEmailRequest;
    const organizationId = body.organizationId;
    const guard = await guardOrganizationAdmin(req, organizationId, corsHeaders);
    if ("response" in guard) return guard.response;

    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "A valid email is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "member";
    if (!ALLOWED_ROLES.has(role)) {
      return new Response(
        JSON.stringify({ error: "Invalid role." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const organizationName = escapeHtml(body.organizationName || "your team");
    const invitedByName = escapeHtml(body.invitedByName || "A team member");
    const safeRole = escapeHtml(role);
    const appUrl = resolveInviteAppUrl(body.appUrl);
    const acceptHref = escapeHtml(`${appUrl}/auth?mode=signup`);

    console.log(`Sending team invitation to ${email}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Madison Studio <hello@madisonstudio.io>";

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: `You've been invited to join ${organizationName} on Madison Studio`,
        reply_to: EMAIL_FROM,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #2D2D2D; font-size: 24px; margin-bottom: 24px;">You've been invited to join ${organizationName}</h1>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
              ${invitedByName} has invited you to join <strong>${organizationName}</strong> on Madison Studio as a <strong>${safeRole}</strong>.
            </p>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
              Click the button below to accept your invitation and get started:
            </p>
            
            <a href="${acceptHref}" 
               style="display: inline-block; background-color: #C4A962; color: #2D2D2D; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; margin-bottom: 32px;">
              Accept Invitation
            </a>
            
            <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 32px; padding-top: 32px; border-top: 1px solid #E5E5E5;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 16px;">
              This invitation will expire in 7 days.
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error("Resend API error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const result = await emailResponse.json();
    console.log("Team invitation email sent successfully:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending team invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
