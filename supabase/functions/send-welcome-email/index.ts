import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";


/**
 * Send welcome email when user signs up
 * 
 * Triggered automatically via database trigger or manually via API call
 */
serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { userEmail, userName } = await req.json();

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "userEmail is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    const { allowed, retryAfter } = checkRateLimit(`email-welcome:${userEmail}`, 3, 60);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
      );
    }

    console.log(`[send-welcome-email] Sending welcome email to ${userEmail}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Madison Studio <hello@madisonstudio.io>";

    if (!RESEND_API_KEY) {
      console.warn("[send-welcome-email] RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({
          message: "Email service not configured",
          skipped: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://app.madisonstudio.io";
    const displayName = userName || userEmail.split('@')[0];

    // Generate beautiful welcome email HTML (User Provided Design)
    const emailHtml = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <title>Welcome to Madison Studio</title>
    <style type="text/css">
        body, table, td, p, a, li, blockquote {
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
            margin: 0;
            padding: 0;
        }
        table, td {
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            border-collapse: collapse;
        }
        body {
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background-color: #F5F1E8;
        }
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
        }
        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100% !important;
            }
            .content-padding {
                padding: 30px 20px !important;
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F1E8;">
    <!-- Preheader -->
    <div style="display: none; max-height: 0; overflow: hidden;">
        Your brand's new creative partner awaits. Start crafting sophisticated content today.
    </div>

    <!-- Email Wrapper -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #F5F1E8;">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                
                <!-- Email Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; background-color: #FFFCF5; border: 1px solid #E5E1D8;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #E5E1D8;">
                            <p style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 22px; font-weight: 400; letter-spacing: 4px; color: #1A1816; text-transform: uppercase;">
                                MADISON STUDIO
                            </p>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td class="content-padding" style="padding: 50px 40px 40px 40px; text-align: center;">
                            
                            <!-- Headline -->
                            <h1 style="margin: 0 0 25px 0; font-family: 'Times New Roman', Times, serif; font-size: 32px; font-weight: 400; line-height: 1.3; color: #1A1816;">
                                Welcome to Madison
                            </h1>

                            <!-- Body Text -->
                            <p style="margin: 0 0 20px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4A4A;">
                                Thank you for joining Madison Studio. We are delighted to help you define your brand's voice with precision and elegance.
                            </p>

                            <p style="margin: 0 0 35px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4A4A;">
                                Your creative partner awaits.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 4px; background-color: #B8956A;">
                                        <a href="${frontendUrl}/dashboard" rel="noopener noreferrer" target="_blank" style="display: inline-block; padding: 16px 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; text-decoration: none; color: #FFFFFF; letter-spacing: 1px; text-transform: uppercase;">
                                            Enter Studio
                                        </a>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px 40px 40px; text-align: center; background-color: #FAF8F3; border-top: 1px solid #E5E1D8;">
                            
                            <!-- Company Name -->
                            <p style="margin: 0 0 15px 0; font-family: 'Times New Roman', Times, serif; font-size: 16px; font-style: italic; color: #1A1816;">
                                Madison Studio
                            </p>

                            <!-- Address -->
                            <p style="margin: 0 0 20px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #888888;">
                                31080 Union City Blvd. Suite 211<br />
                                Union City, CA 94587
                            </p>

                            <!-- Footer Links -->
                            <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888888;">
                                <a href="${frontendUrl}/help" style="color: #B8956A; text-decoration: none;">Help Center</a>
                                <span style="color: #CCCCCC; padding: 0 8px;">•</span>
                                <a href="${frontendUrl}/privacy" style="color: #B8956A; text-decoration: none;">Privacy Policy</a>
                                <span style="color: #CCCCCC; padding: 0 8px;">•</span>
                                <a href="${frontendUrl}/terms" style="color: #B8956A; text-decoration: none;">Terms of Service</a>
                            </p>

                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>
    `;

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [userEmail],
        subject: "Welcome to Madison Studio! 🎉",
        html: emailHtml,
        reply_to: EMAIL_FROM,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error("[send-welcome-email] Resend API error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const result = await emailResponse.json();
    console.log("[send-welcome-email] Welcome email sent successfully:", result);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[send-welcome-email] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
