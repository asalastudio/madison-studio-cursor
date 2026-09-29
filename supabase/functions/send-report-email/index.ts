import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardSelfOrServiceEmail } from "../_shared/edgeAuth.ts";
import { escapeHtml } from "../_shared/htmlEscape.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isTrustedReportUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const protocolOk = parsed.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
    if (!protocolOk) return false;
    return (
      host === "app.madisonstudio.io" ||
      host.endsWith(".madisonstudio.io") ||
      host === "madison-studio-cursor.vercel.app" ||
      host.endsWith(".supabase.co") ||
      host.endsWith(".supabase.in") ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

/**
 * Send report email on first scan
 * 
 * Sends an email with:
 * - Link to living report page
 * - Download PDF link (or attached PDF if available)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      userEmail,
      domain,
      reportUrl,
      pdfUrl,
      brandName
    } = await req.json();

    if (!userEmail || !domain || !reportUrl) {
      return new Response(
        JSON.stringify({ error: "userEmail, domain, and reportUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const guard = await guardSelfOrServiceEmail(req, userEmail, corsHeaders);
    if ("response" in guard) return guard.response;

    if (!isTrustedReportUrl(reportUrl) || (pdfUrl && !isTrustedReportUrl(pdfUrl))) {
      return new Response(
        JSON.stringify({ error: "Report URL is not allowed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-report-email] Sending report email to ${userEmail} for ${domain}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    // Use custom domain email instead of resend.dev to avoid spam filters
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Madison Studio <hello@madisonstudio.io>";

    if (!RESEND_API_KEY) {
      console.warn("[send-report-email] RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({
          message: "Email service not configured",
          skipped: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://app.madisonstudio.io";
    const displayBrandName = escapeHtml(brandName || domain);
    const safeReportUrl = escapeHtml(reportUrl);
    const safePdfUrl = pdfUrl ? escapeHtml(pdfUrl) : "";
    const safeFrontendUrl = escapeHtml(frontendUrl);

    // Generate email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F5F1E8; color: #2D2D2D;">
          <div style="background-color: #FFFFFF; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            
            <h1 style="color: #2D2D2D; font-size: 28px; margin-bottom: 24px; font-weight: 600;">
              Your Brand Audit is Ready! 🎉
            </h1>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
              We've completed your brand audit for <strong>${displayBrandName}</strong>. Your comprehensive brand report is ready to view.
            </p>
            
            <div style="background-color: #F5F1E8; padding: 24px; border-radius: 6px; margin-bottom: 32px; border-left: 4px solid #C4A962;">
              <p style="color: #2D2D2D; font-size: 14px; margin: 0; font-weight: 600; margin-bottom: 8px;">
                📊 What's Included:
              </p>
              <ul style="color: #666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>Brand identity & positioning analysis</li>
                <li>Visual language (colors, typography)</li>
                <li>Messaging & copy assessment</li>
                <li>Strategic recommendations</li>
              </ul>
            </div>
            
            <div style="margin-bottom: 32px;">
              <a href="${safeReportUrl}" 
                 style="display: inline-block; background-color: #C4A962; color: #2D2D2D; text-decoration: none; padding: 16px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; margin-bottom: 16px; text-align: center;">
                View Living Report →
              </a>
            </div>
            
            ${pdfUrl ? `
            <div style="margin-bottom: 32px;">
              <p style="color: #666; font-size: 14px; margin-bottom: 12px;">
                Or download the PDF version:
              </p>
              <a href="${safePdfUrl}" 
                 style="display: inline-block; background-color: #2D2D2D; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                Download PDF Report
              </a>
            </div>
            ` : `
            <div style="margin-bottom: 32px;">
              <p style="color: #666; font-size: 14px; margin-bottom: 12px;">
                <strong>💡 Tip:</strong> Your report is a "living document" that updates automatically with each new scan. Bookmark the link above to always see your latest brand analysis.
              </p>
            </div>
            `}
            
            <div style="border-top: 1px solid #E5E5E5; padding-top: 24px; margin-top: 32px;">
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
                This report was generated by <strong>Madison Studio</strong>.<br>
                Questions? Reply to this email or visit <a href="${safeFrontendUrl}" style="color: #C4A962;">Madison Studio</a>
              </p>
            </div>
            
          </div>
        </body>
      </html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [userEmail],
        subject: `Your Brand Audit for ${displayBrandName} is Ready`,
        html: emailHtml,
        reply_to: EMAIL_FROM, // Ensure replies go to your domain
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error("[send-report-email] Resend API error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const result = await emailResponse.json();
    console.log("[send-report-email] Report email sent successfully:", result);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[send-report-email] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

