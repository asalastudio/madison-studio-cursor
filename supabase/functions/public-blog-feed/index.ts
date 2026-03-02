/**
 * Public Blog Feed API
 * 
 * Returns published blog content for external websites (like Asala)
 * No authentication required - only returns published, public content
 * 
 * Usage: GET /functions/v1/public-blog-feed?org=your-org-slug
 * Optional: ?limit=10&offset=0&type=blog_article
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;           // Raw content (markdown/plain text)
  content_html: string;      // Pre-rendered HTML for display
  excerpt: string;
  content_type: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  author?: string;
  featured_image?: string;
  tags?: string[];
  meta_description?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    
    // Query parameters
    const orgSlug = url.searchParams.get("org");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const contentType = url.searchParams.get("type"); // e.g., "blog_article", "blog_post"
    const postId = url.searchParams.get("id"); // Get single post by ID
    const postSlug = url.searchParams.get("slug"); // Get single post by slug

    // Create Supabase client with service role for read access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // If requesting a single post by ID
    if (postId) {
      const { data: post, error } = await supabase
        .from("master_content")
        .select(`
          id,
          title,
          full_content,
          content_type,
          status,
          published_at,
          created_at,
          updated_at,
          featured_image_url,
          organization_id,
          organizations!inner(slug, name)
        `)
        .eq("id", postId)
        .eq("status", "published")
        .single();

      if (error || !post) {
        return new Response(
          JSON.stringify({ error: "Post not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const formattedPost = formatPost(post);
      return new Response(
        JSON.stringify({ post: formattedPost }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build query for multiple posts
    let query = supabase
      .from("master_content")
      .select(`
        id,
        title,
        full_content,
        content_type,
        status,
        published_at,
        created_at,
        updated_at,
        featured_image_url,
        organization_id,
        organizations!inner(slug, name)
      `, { count: 'exact' })
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    // Filter by organization slug if provided
    if (orgSlug) {
      query = query.eq("organizations.slug", orgSlug);
    }

    // Filter by content type if specified
    if (contentType) {
      query = query.ilike("content_type", `%${contentType}%`);
    }
    // If no type filter, return ALL published content (not just blogs)

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: posts, error, count } = await query;

    if (error) {
      console.error("[public-blog-feed] Query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch posts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format posts for public consumption
    const formattedPosts: BlogPost[] = (posts || []).map(formatPost);

    return new Response(
      JSON.stringify({
        posts: formattedPosts,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit,
        },
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60", // Cache for 1 minute
        } 
      }
    );

  } catch (error) {
    console.error("[public-blog-feed] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatPost(post: any): BlogPost {
  // Generate slug from title if not available
  const slug = generateSlug(post.title);
  
  // Extract excerpt from content (first 200 chars, strip markdown/html)
  const excerpt = extractExcerpt(post.full_content, 200);
  
  // Convert content to beautiful HTML
  const contentHtml = convertToHtml(post.full_content);
  
  return {
    id: post.id,
    title: post.title,
    slug: slug,
    content: post.full_content,
    content_html: contentHtml,
    excerpt: excerpt,
    content_type: post.content_type,
    published_at: post.published_at || post.created_at,
    created_at: post.created_at,
    updated_at: post.updated_at,
    author: undefined,
    featured_image: post.featured_image_url || undefined,
    tags: [],
    meta_description: excerpt,
  };
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Convert markdown-style content to semantic HTML
 * 
 * Handles:
 * - Headers (# ## ###)
 * - Bold (**text**)
 * - Italic (*text* or _text_)
 * - Links [text](url)
 * - Bullet lists (- or *)
 * - Numbered lists (1. 2. etc)
 * - Blockquotes (>)
 * - Code blocks (```)
 * - Inline code (`code`)
 * - Paragraphs (double newlines)
 */
function convertToHtml(content: string): string {
  if (!content) return '';
  
  // If content is already HTML, return as-is
  if (content.trim().startsWith('<') && /<[a-z][\s\S]*>/i.test(content)) {
    return content;
  }
  
  let html = content;
  
  // Normalize line endings
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Escape HTML entities first (before we add our own tags)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks (``` ... ```) - must be done before other processing
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
  });
  
  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Headers (must restore > for blockquotes first)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Italic (*text* or _text_) - be careful not to match bold markers
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
  
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Blockquotes (&gt; at start of line, we escaped > earlier)
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
  
  // Horizontal rule (--- or ***)
  html = html.replace(/^(---|\*\*\*)$/gm, '<hr>');
  
  // Bullet lists (- or * at start of line)
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  
  // Numbered lists (1. 2. etc)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, (match) => {
    return `<ul>${match}</ul>`;
  });
  
  // Split into paragraphs (double newlines)
  const blocks = html.split(/\n\n+/);
  
  html = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    
    // Don't wrap if it's already a block element
    if (
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<hr')
    ) {
      return trimmed;
    }
    
    // Convert single newlines to <br> within paragraphs
    const withBreaks = trimmed.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  }).filter(Boolean).join('\n');
  
  return html;
}

function extractExcerpt(content: string, maxLength: number): string {
  if (!content) return '';
  
  // Strip markdown/html tags
  const text = content
    .replace(/#{1,6}\s/g, '') // Remove markdown headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim();
  
  if (text.length <= maxLength) return text;
  
  // Cut at word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
}
