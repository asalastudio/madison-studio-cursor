/**
 * SocialQueuePanel — what is queued, what went out, what broke.
 *
 * Sits on the Calendar page so the content plan and its delivery state are in
 * one place rather than split across two mental models.
 */

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Loader2, RotateCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SOCIAL_PLATFORMS } from "@/config/socialPlatforms";
import { useSocialPosts, type SocialPostRow } from "@/hooks/useSocialPosts";

export function SocialQueuePanel() {
  const { toast } = useToast();
  const { upcoming, failed, published, schemaMissing, isLoading, retry, cancel } = useSocialPosts();
  const [tab, setTab] = useState("upcoming");

  const handleRetry = async (post: SocialPostRow) => {
    try {
      await retry.mutateAsync(post.id);
      toast({ title: "Retrying", description: `Re-attempting the ${post.platform} post.` });
    } catch (error) {
      toast({
        title: "Retry failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (post: SocialPostRow) => {
    try {
      await cancel.mutateAsync(post.id);
      toast({ title: "Cancelled", description: "The post will not be published." });
    } catch (error) {
      toast({
        title: "Could not cancel",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  if (schemaMissing) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Social queue</CardTitle>
        <CardDescription>
          Posts waiting to go out, and what happened to the ones that already did.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="upcoming">
                Upcoming
                {upcoming.length > 0 && <Badge variant="secondary" className="ml-2">{upcoming.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed
                {failed.length > 0 && <Badge variant="destructive" className="ml-2">{failed.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="pt-3">
              <PostList
                posts={upcoming}
                emptyMessage="Nothing queued. Use “Post to social” to schedule something."
                onCancel={handleCancel}
              />
            </TabsContent>

            <TabsContent value="failed" className="pt-3">
              {failed.length > 0 && (
                <Alert variant="destructive" className="mb-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Failed posts are not retried automatically once their attempts run out. Fix the
                    cause, then retry.
                  </AlertDescription>
                </Alert>
              )}
              <PostList
                posts={failed}
                emptyMessage="No failures."
                onRetry={handleRetry}
                onCancel={handleCancel}
              />
            </TabsContent>

            <TabsContent value="published" className="pt-3">
              <PostList posts={published.slice(0, 20)} emptyMessage="Nothing published yet." />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function PostList({
  posts,
  emptyMessage,
  onRetry,
  onCancel,
}: {
  posts: SocialPostRow[];
  emptyMessage: string;
  onRetry?: (post: SocialPostRow) => void;
  onCancel?: (post: SocialPostRow) => void;
}) {
  if (posts.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2">
      {posts.map((post) => {
        const spec = SOCIAL_PLATFORMS[post.platform];
        const Icon = spec?.icon;
        const thumbnail = post.media?.find((item) => item.type === "image");

        return (
          <li
            key={post.id}
            className="flex items-start gap-3 rounded-md border px-3 py-2"
          >
            {thumbnail ? (
              <img src={thumbnail.url} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                {Icon && <Icon className="h-4 w-4" style={{ color: spec.brandColor }} />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {Icon && <Icon className="h-3.5 w-3.5" style={{ color: spec.brandColor }} />}
                <span className="text-xs font-medium">{spec?.label ?? post.platform}</span>
                <StatusChip post={post} />
              </div>
              <p className="truncate text-sm">{post.caption || "(no caption)"}</p>
              {post.error_message && (
                <p className="truncate text-xs text-destructive">{post.error_message}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {post.permalink && (
                <Button variant="ghost" size="icon" asChild aria-label="Open post">
                  <a href={post.permalink} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {onRetry && (
                <Button variant="ghost" size="sm" onClick={() => onRetry(post)}>
                  <RotateCw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
              )}
              {onCancel && post.status !== "published" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onCancel(post)}
                  aria-label="Cancel post"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusChip({ post }: { post: SocialPostRow }) {
  if (post.status === "published") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        {post.published_at ? new Date(post.published_at).toLocaleString() : "Published"}
      </span>
    );
  }

  if (post.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        Failed after {post.attempt_count} attempt{post.attempt_count === 1 ? "" : "s"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        post.status === "publishing" ? "text-amber-600" : "text-muted-foreground",
      )}
    >
      <Clock className="h-3 w-3" />
      {post.status === "publishing"
        ? "Publishing…"
        : post.scheduled_for
          ? new Date(post.scheduled_for).toLocaleString()
          : "Draft"}
    </span>
  );
}
