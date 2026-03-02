import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
  generateGeminiContent,
  extractTextFromGeminiResponse,
} from "../_shared/geminiClient.ts";


// Helper to clean HTML
const cleanHtml = (html: string) => {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gim, "") 
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gim, "")
    .replace(/<[^>]+>/g, " ") // Remove tags
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
};

// Helper to extract links
const extractLinks = (html: string, baseUrl: string) => {
  const links = new Set<string>();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    let href = match[1];
    
    // Normalize URL
    if (href.startsWith("/")) {
      href = `${new URL(baseUrl).origin}${href}`;
    } else if (!href.startsWith("http")) {
      continue;
    }

    // Only keep internal links
    if (href.includes(new URL(baseUrl).hostname)) {
      links.add(href);
    }
  }
  return Array.from(links);
};

// Helper to score link relevance
const scoreLink = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.includes("about")) return 10;
  if (lower.includes("story")) return 9;
  if (lower.includes("mission")) return 9;
  if (lower.includes("ethos")) return 8;
  if (lower.includes("values")) return 8;
  if (lower.includes("blog")) return 5;
  if (lower.includes("journal")) return 5;
  if (lower.includes("news")) return 4;
  return 0;
};

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { url, organizationId } = await req.json();

    if (!url || !organizationId) {
      return new Response(
        JSON.stringify({ error: "URL and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraping website:", url, "for organization:", organizationId);

    // Check for API Key
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      console.error("GEMINI_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing AI API key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    // 1. Fetch Homepage
    const homeResponse = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!homeResponse.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Could not access website (${homeResponse.status}). It may be blocking automated access.`,
          details: homeResponse.statusText 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const homeHtml = await homeResponse.text();
    const homeText = cleanHtml(homeHtml);
    
    // 2. Find high-value subpages
    const allLinks = extractLinks(homeHtml, url);
    const relevantLinks = allLinks
      .map(link => ({ link, score: scoreLink(link) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3) // Top 3 pages
      .map(item => item.link);

    console.log("Found relevant pages:", relevantLinks);

    // 3. Fetch subpages in parallel
    const subPageContents = await Promise.all(
      relevantLinks.map(async (link) => {
        try {
          const res = await fetch(link, {
            headers: { "User-Agent": userAgent }
          });
          if (res.ok) {
            const html = await res.text();
            return `\n\n--- SOURCE: ${link} ---\n${cleanHtml(html)}`;
          }
        } catch (e) {
          console.warn(`Failed to fetch ${link}`, e);
        }
        return "";
      })
    );

    // 4. Combine all text
    let fullContent = `--- SOURCE: HOMEPAGE (${url}) ---\n${homeText}`;
    fullContent += subPageContents.join("");

    // Limit to 25,000 chars (Gemini Pro can handle large contexts)
    fullContent = fullContent.substring(0, 25000);
    console.log("Total scraped content length:", fullContent.length);
    
    if (fullContent.length < 200) {
       return new Response(
        JSON.stringify({ 
          error: `This website uses JavaScript to load content, which our scanner can't read. Please use Manual Entry or upload a brand document instead. (Only ${fullContent.length} characters found)`,
          details: "Less than 200 characters of text found. This usually means the site loads content via JavaScript."
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Analyze with Madison's Board of Advisors (Gemini 1.5 Pro)
    const analysisPrompt = `You are Madison, a strategic brand consultant backed by a "Board of Advisors" consisting of Peter Drucker, Jay Abraham, and David Ogilvy.

    Your goal is to perform a "Strategic Brand Audit" based on the scraped website content below.

    ADVISOR FRAMEWORKS TO APPLY:
    1.  **Peter Drucker (The Fundamentals):**
        -   "What is our business?" (The true value provided, not just the product)
        -   "Who is the customer?" (Not demographics, but psychographics and values)
        -   "What does the customer consider value?"

    2.  **Jay Abraham (The Leverage):**
        -   Identify the "Unique Selling Proposition" (USP).
        -   Look for "Risk Reversal" (Guarantees, trust signals).
        -   Identify "Hidden Assets" or underutilized leverage points in their copy.

    3.  **David Ogilvy (The Brand Image):**
        -   Analyze the "Brand Image" (Personality, Class, Authority).
        -   Evaluate the "Big Idea" (Is there a core concept, or just noise?).
        -   Check for "Specifics" vs. "Generalities" (Ogilvy hates empty adjectives).

    EXTRACT AND SYNTHESIZE THE FOLLOWING JSON STRUCTURE:

    {
      "brand_voice": {
         "tone": ["adj1", "adj2", "adj3"],
         "style": "Description of writing style (e.g., punchy, academic, poetic)",
         "perspective": "1st person (We) vs 3rd person (The Brand)"
      },
      "brand_identity": {
         "mission": "Inferred mission statement (Drucker: What is the business?)",
         "values": ["Value 1", "Value 2", "Value 3"],
         "target_audience": "Drucker-style audience definition (Who is the customer?)"
      },
      "vocabulary": {
         "keywords": ["word1", "word2", "word3"],
         "phrases": ["phrase 1", "phrase 2"],
         "forbidden_inferred": ["Words they avoid (e.g., slang, jargon, passive voice)"]
      },
      "strategic_audit": {
         "summary": "A 2-3 sentence executive summary of the brand's health.",
         "strengths": ["Strength 1 (e.g., Strong risk reversal)", "Strength 2"],
         "weaknesses": ["Weakness 1 (e.g., Vague value proposition)", "Weakness 2"],
         "opportunities": ["Opportunity 1 (e.g., Jay Abraham: Add a stronger guarantee)", "Opportunity 2"]
      },
      "content_strategy": {
         "themes": ["Theme 1", "Theme 2"],
         "hooks": ["Example hook 1", "Example hook 2"]
      }
    }

    Return ONLY valid JSON.`;

    const aiData = await generateGeminiContent({
      systemPrompt: analysisPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze this scraped content:\n\n${fullContent}`,
        },
      ],
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    const analysisText = extractTextFromGeminiResponse(aiData);
    let brandAnalysis;
    
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        brandAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (e) {
      console.error("Failed to parse AI JSON", e);
      brandAnalysis = { raw: analysisText };
    }

    // Save to Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete old website_scrape entries first to avoid accumulation
    const { error: deleteError } = await supabase
      .from("brand_knowledge")
      .delete()
      .eq("organization_id", organizationId)
      .eq("knowledge_type", "website_scrape");
    
    if (deleteError) {
      console.warn("[scrape-brand-website] Could not delete old entries:", deleteError);
      // Continue anyway - new data will still be added
    }

    const { error: insertError } = await supabase.from("brand_knowledge").insert({
      organization_id: organizationId,
      knowledge_type: "website_scrape",
      content: {
        ...brandAnalysis,
        scraped_pages: [url, ...relevantLinks]
      },
    });

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, analysis: brandAnalysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[scrape-brand-website] Error:", error);
    
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : String(error);
    
    // Check for common issues
    let userFriendlyMessage = errorMessage;
    if (errorMessage.includes("GEMINI_API_KEY")) {
      userFriendlyMessage = "AI service is not configured. Please contact support.";
    } else if (errorMessage.includes("fetch failed") || errorMessage.includes("network")) {
      userFriendlyMessage = "Could not connect to the website. Please check the URL and try again.";
    } else if (errorMessage.includes("brand_knowledge")) {
      userFriendlyMessage = "Failed to save analysis results. Please try again.";
    }
    
    return new Response(
      JSON.stringify({ 
        error: userFriendlyMessage,
        // Include stack trace in logs but not in response
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});