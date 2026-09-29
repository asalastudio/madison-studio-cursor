export type RepurposeBlogSource = {
  id: string;
  title: string;
  full_content: string;
};

export function buildRepurposeBlogRequest(blogPost: RepurposeBlogSource) {
  return {
    masterContentId: blogPost.id,
    derivativeTypes: ["product"],
    masterContent: {
      full_content: blogPost.full_content,
    },
  };
}

export function extractRepurposeBlogResult(
  data: {
    success?: boolean;
    derivatives?: Array<{ generated_content?: string | null }>;
  } | null,
  fallback: Pick<RepurposeBlogSource, "title" | "full_content">,
): { title: string; description: string; tags: string[] } {
  const generated = data?.derivatives?.[0]?.generated_content?.trim();
  return {
    title: fallback.title.slice(0, 100),
    description: generated || fallback.full_content.slice(0, 500),
    tags: [],
  };
}
