/**
 * SocialConnections — connect/disconnect card for every publishing channel.
 *
 * One row per platform, expanding to the individual accounts behind it (a Meta
 * grant can return several Pages and their Instagram accounts at once).
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_ORDER,
  type SocialPlatformId,
} from "@/config/socialPlatforms";
import {
  useSocialConnections,
  type SocialConnectionSummary,
} from "@/hooks/useSocialConnections";

export function SocialConnections() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    connections,
    connectionsByPlatform,
    schemaMissing,
    isLoading,
    refetch,
    connect,
    disconnect,
    canManage,
    organizationId,
  } = useSocialConnections();

  // The OAuth callback redirects back here with its result in the query string.
  useEffect(() => {
    const success = searchParams.get("social_success");
    const error = searchParams.get("social_error");
    if (!success && !error) return;

    const platform = searchParams.get("social_platform");
    const label = platform ? (SOCIAL_PLATFORMS[platform as SocialPlatformId]?.label ?? platform) : "Account";

    if (success) {
      const count = Number(searchParams.get("social_accounts_connected") ?? "1");
      toast({
        title: `${label} connected`,
        description:
          count > 1
            ? `${count} accounts are now available to publish to.`
            : (searchParams.get("social_account") ?? "Ready to publish."),
      });
      refetch();
    } else if (error) {
      toast({
        title: `Could not connect ${label}`,
        description: humanizeOAuthError(error),
        variant: "destructive",
      });
    }

    for (const key of [
      "social_success",
      "social_error",
      "social_platform",
      "social_account",
      "social_accounts_connected",
    ]) {
      searchParams.delete(key);
    }
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, toast, refetch]);

  const handleConnect = async (platform: SocialPlatformId) => {
    try {
      const result = await connect.mutateAsync({ platform });
      window.location.href = result.authUrl;
    } catch (error) {
      toast({
        title: `Could not start the ${SOCIAL_PLATFORMS[platform].label} connection`,
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async (connection: SocialConnectionSummary) => {
    try {
      await disconnect.mutateAsync(connection.id);
      toast({
        title: "Disconnected",
        description: `${connection.external_account_name ?? connection.external_account_id} will no longer receive posts.`,
      });
    } catch (error) {
      toast({
        title: "Could not disconnect",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  if (!organizationId) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Select an organization to manage publishing channels.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const needsAttention = connections.filter(
    (connection) => connection.status !== "active" || connection.token_expiring_soon,
  );

  return (
    <div className="space-y-4">
      {schemaMissing && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Social publishing tables are not in the database yet. Apply{" "}
            <code className="text-xs">20260911090000_social_publishing_core.sql</code> to enable
            connecting accounts.
          </AlertDescription>
        </Alert>
      )}

      {needsAttention.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {needsAttention.length} connection{needsAttention.length === 1 ? "" : "s"} need
            attention. Scheduled posts to {needsAttention.length === 1 ? "it" : "them"} will fail
            until reconnected.
          </AlertDescription>
        </Alert>
      )}

      {SOCIAL_PLATFORM_ORDER.map((platformId) => {
        const spec = SOCIAL_PLATFORMS[platformId];
        const platformConnections = connectionsByPlatform.get(platformId) ?? [];
        const Icon = spec.icon;

        return (
          <div key={platformId} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${spec.brandColor}14`, color: spec.brandColor }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{spec.label}</h4>
                    {!spec.supported && <Badge variant="outline">Coming soon</Badge>}
                    {platformConnections.length > 0 && (
                      <Badge variant="secondary">
                        {platformConnections.length} account
                        {platformConnections.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{spec.valueNote}</p>
                  {platformConnections.length === 0 && (
                    <p className="text-xs text-muted-foreground">{spec.setupNote}</p>
                  )}
                </div>
              </div>

              {spec.supported && canManage && (
                <Button
                  variant={platformConnections.length > 0 ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleConnect(platformId)}
                  disabled={connect.isPending}
                >
                  {connect.isPending && connect.variables?.platform === platformId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : platformConnections.length > 0 ? (
                    <Plus className="mr-2 h-4 w-4" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  {platformConnections.length > 0 ? "Add account" : "Connect"}
                </Button>
              )}
            </div>

            {platformConnections.length > 0 && (
              <div className="mt-4 space-y-2 border-t pt-3">
                {platformConnections.map((connection) => (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    canManage={canManage}
                    onReconnect={() => handleConnect(platformId)}
                    onDisconnect={() => handleDisconnect(connection)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConnectionRow({
  connection,
  canManage,
  onReconnect,
  onDisconnect,
}: {
  connection: SocialConnectionSummary;
  canManage: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const healthy = connection.status === "active" && !connection.token_expiring_soon;
  const name = connection.external_account_name ?? connection.external_account_id;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {connection.external_account_avatar_url ? (
          <img
            src={connection.external_account_avatar_url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-xs font-medium">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                healthy ? "text-emerald-600" : "text-destructive",
              )}
            >
              {healthy ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {healthy
                ? "Connected"
                : connection.status === "active"
                  ? "Token expiring"
                  : "Needs reconnecting"}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {connection.external_account_handle
              ? `@${connection.external_account_handle}`
              : connection.account_type}
            {connection.external_parent_name ? ` · via ${connection.external_parent_name}` : ""}
            {connection.last_published_at
              ? ` · last post ${new Date(connection.last_published_at).toLocaleDateString()}`
              : ""}
          </p>
          {connection.status_detail && (
            <p className="truncate text-xs text-destructive">{connection.status_detail}</p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          {!healthy && (
            <Button variant="ghost" size="sm" onClick={onReconnect}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Reconnect
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Disconnect ${name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The stored access token is deleted. Scheduled posts targeting this account will
                  fail until you reconnect it. Posts already published stay on the platform.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDisconnect}>Disconnect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function humanizeOAuthError(code: string): string {
  switch (code) {
    case "not_configured":
      return "The platform app credentials are not set as Supabase secrets yet.";
    case "encryption_key_missing":
      return "SOCIAL_TOKEN_ENCRYPTION_KEY is not set on the Supabase project.";
    case "no_pages_found":
      return "No Facebook Page was returned. Instagram publishing needs a Business account linked to a Page you administer.";
    case "no_accounts_found":
      return "The platform returned no publishable account for this login.";
    case "state_expired":
      return "The connection window timed out. Try again.";
    case "token_exchange_failed":
      return "The platform refused the authorization code. Check the redirect URI registered on the app.";
    case "connection_save_failed":
      return "The account authorised but could not be saved. Check the Supabase logs.";
    default:
      return code.replace(/_/g, " ");
  }
}
