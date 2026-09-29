import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSearch, FileText, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildRepurposeBlogRequest, extractRepurposeBlogResult } from "@/lib/repurposeBlogRequest";

interface RepurposeBlogDialogProps {
  onRepurpose: (title: string, description: string, tags: string[]) => void;
}

export function RepurposeBlogDialog({ onRepurpose }: RepurposeBlogDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [repurposing, setRepurposing] = useState(false);

  useEffect(() => {
    if (open) {
      loadBlogPosts();
    }
  }, [open, user]);

  const loadBlogPosts = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!orgMember) return;

      const { data, error } = await supabase
        .from("master_content")
        .select("id, title, full_content, created_at")
        .eq("organization_id", orgMember.organization_id)
        .eq("content_type", "blog_article")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setBlogPosts(data || []);
    } catch (error) {
      console.error("Error loading blog posts:", error);
      toast.error("Failed to load blog posts");
    } finally {
      setLoading(false);
    }
  };

  const handleRepurpose = async (blogPost: any) => {
    setRepurposing(true);
    try {
      const { data, error } = await supabase.functions.invoke("repurpose-content", {
        body: buildRepurposeBlogRequest(blogPost),
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to generate a product listing from this post");
      }

      const { title, description, tags } = extractRepurposeBlogResult(data, blogPost);
      onRepurpose(title, description, tags);
      setOpen(false);
      toast.success("Blog post repurposed successfully!");
    } catch (error: any) {
      console.error("Error repurposing blog post:", error);
      toast.error(error.message || "Failed to repurpose blog post");
    } finally {
      setRepurposing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-charcoal/70 border-charcoal/20">
          <FileSearch className="w-4 h-4 mr-2" />
          Repurpose from Blog Post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Blog Post to Repurpose</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading blog posts...</div>
          ) : blogPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No blog posts found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blogPosts.map((post) => (
                <button
                  type="button"
                  key={post.id}
                  onClick={() => handleRepurpose(post)}
                  disabled={repurposing}
                  className="w-full p-4 border rounded-lg hover:bg-accent/50 transition-colors text-left disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{post.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {post.full_content.substring(0, 150)}...
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(post.created_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <FileSearch className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
