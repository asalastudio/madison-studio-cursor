/**
 * SocialComposer — write once, tune per channel, publish now or schedule.
 *
 * All fan-out logic (which media each platform gets, which fields are dropped,
 * what blocks publishing) lives in src/lib/social/composerPlan.ts so it stays
 * testable; this component is the surface over it.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ExternalLink,
  ImagePlus,
  Info,
  Loader2,
  Send,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ImageLibraryPicker } from "@/components/email-composer/ImageLibraryPicker";
import {
  SOCIAL_PLATFORMS,
  TIKTOK_PRIVACY_OPTIONS,
  type SocialPlatformId,
} from "@/config/socialPlatforms";
import { useSocialConnections } from "@/hooks/useSocialConnections";
import {
  buildComposerPlan,
  captionFor,
  emptyComposerState,
  toPublishPayload,
  type ComposerConnection,
  type ComposerMedia,
  type ComposerState,
} from "@/lib/social/composerPlan";

export interface SocialComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled caption, e.g. a derivative asset from Multiply. */
  initialCaption?: string;
  initialMedia?: ComposerMedia[];
  initialLinkUrl?: string;
  /** Prefilled schedule slot, e.g. a clicked calendar day. */
  initialScheduledFor?: Date | null;
  scheduledContentId?: string | null;
  masterContentId?: string | null;
  derivativeAssetId?: string | null;
  onPublished?: () => void;
}

export function SocialComposer({
  open,
  onOpenChange,
  initialCaption = "",
  initialMedia = [],
  initialLinkUrl = "",
  initialScheduledFor = null,
  scheduledContentId = null,
  masterContentId = null,
  derivativeAssetId = null,
  onPublished,
}: SocialComposerProps) {
  const { toast } = useToast();
  const { activeConnections, isLoading, organizationId } = useSocialConnections();

  const [state, setState] = useState<ComposerState>(() =>
    emptyComposerState({
      baseCaption: initialCaption,
      media: initialMedia,
      linkUrl: initialLinkUrl,
    }),
  );
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">(
    initialScheduledFor ? "schedule" : "now",
  );
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInputValue(initialScheduledFor));
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");

  // Re-seed whenever the dialog is reopened from a different source.
  useEffect(() => {
    if (!open) return;
    setState(
      emptyComposerState({
        baseCaption: initialCaption,
        media: initialMedia,
        linkUrl: initialLinkUrl,
      }),
    );
    setScheduleMode(initialScheduledFor ? "schedule" : "now");
    setScheduledAt(toLocalInputValue(initialScheduledFor));
    setActiveTab("compose");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const composerConnections: ComposerConnection[] = useMemo(
    () =>
      activeConnections.map((connection) => ({
        id: connection.id,
        platform: connection.platform,
        accountName: connection.external_account_name ?? connection.external_account_id,
        accountHandle: connection.external_account_handle,
        status: connection.status,
      })),
    [activeConnections],
  );

  const plan = useMemo(
    () => buildComposerPlan({ state, connections: composerConnections }),
    [state, composerConnections],
  );

  const selectedPlatforms = useMemo(
    () => [...new Set(plan.targets.map((target) => target.platform))],
    [plan.targets],
  );

  const toggleConnection = (connectionId: string) => {
    setState((current) => ({
      ...current,
      selectedConnectionIds: current.selectedConnectionIds.includes(connectionId)
        ? current.selectedConnectionIds.filter((id) => id !== connectionId)
        : [...current.selectedConnectionIds, connectionId],
    }));
  };

  const setPlatformOption = (platform: SocialPlatformId, key: string, value: unknown) => {
    setState((current) => ({
      ...current,
      platformOptions: {
        ...current.platformOptions,
        [platform]: { ...(current.platformOptions[platform] ?? {}), [key]: value },
      },
    }));
  };

  const addMedia = (url: string) => {
    if (!url) return;
    setState((current) =>
      current.media.some((item) => item.url === url)
        ? current
        : {
            ...current,
            media: [...current.media, { url, type: inferMediaKind(url) }],
          },
    );
  };

  const removeMedia = (url: string) => {
    setState((current) => ({
      ...current,
      media: current.media.filter((item) => item.url !== url),
    }));
  };

  const handleSubmit = async () => {
    if (!organizationId) return;
    setSubmitting(true);

    try {
      const scheduledFor =
        scheduleMode === "schedule" && scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null;

      if (scheduleMode === "schedule" && !scheduledFor) {
        toast({ title: "Pick a date and time", variant: "destructive" });
        return;
      }

      const payload = toPublishPayload({
        plan,
        organizationId,
        mode: scheduleMode,
        scheduledFor,
        scheduledContentId,
        masterContentId,
        derivativeAssetId,
        // Guards against a double-click creating two identical fan-outs.
        idempotencyKey: `${organizationId}:${Date.now()}`,
      });

      const { data, error } = await supabase.functions.invoke("social-publish", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) {
        const detail = Array.isArray(data.validations)
          ? data.validations
              .flatMap((entry: any) => entry.errors?.map((issue: any) => issue.message) ?? [])
              .join(" ")
          : data.error;
        throw new Error(detail || data.error);
      }

      if (scheduleMode === "schedule") {
        toast({
          title: "Scheduled",
          description: `${plan.targets.length} post${plan.targets.length === 1 ? "" : "s"} queued for ${new Date(scheduledFor!).toLocaleString()}.`,
        });
      } else {
        const published = data?.publishedCount ?? 0;
        const total = data?.totalCount ?? plan.targets.length;
        const failures = (data?.results ?? []).filter(
          (entry: any) => entry.outcome?.status !== "published",
        );

        toast({
          title: published === total ? "Published" : `Published ${published} of ${total}`,
          description:
            failures.length > 0
              ? failures
                  .map((entry: any) => `${entry.platform}: ${entry.outcome?.errorMessage ?? "failed"}`)
                  .join(" · ")
              : "Live on every selected channel.",
          variant: published === 0 ? "destructive" : undefined,
        });
      }

      onPublished?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: scheduleMode === "schedule" ? "Could not schedule" : "Could not publish",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish to social</DialogTitle>
          <DialogDescription>
            Write once, adjust per channel. Madison validates each platform's rules before anything
            is sent.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : composerConnections.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No social accounts are connected yet. Add one under Settings → Integrations, then come
              back here.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            {/* Channels ------------------------------------------------- */}
            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="flex flex-wrap gap-2">
                {composerConnections.map((connection) => {
                  const spec = SOCIAL_PLATFORMS[connection.platform];
                  const Icon = spec.icon;
                  const selected = state.selectedConnectionIds.includes(connection.id);
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={() => toggleConnection(connection.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      <Icon className="h-4 w-4" style={{ color: spec.brandColor }} />
                      <span className="max-w-[14rem] truncate">{connection.accountName}</span>
                      {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="compose">Compose</TabsTrigger>
                <TabsTrigger value="perChannel" disabled={selectedPlatforms.length === 0}>
                  Per channel
                  {plan.errorCount > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {plan.errorCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Compose ------------------------------------------------ */}
              <TabsContent value="compose" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="social-caption">Caption</Label>
                  <Textarea
                    id="social-caption"
                    rows={6}
                    value={state.baseCaption}
                    onChange={(event) =>
                      setState((current) => ({ ...current, baseCaption: event.target.value }))
                    }
                    placeholder="What is going out?"
                  />
                  <CaptionMeters caption={state.baseCaption} platforms={selectedPlatforms} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="social-title">Title (Pinterest)</Label>
                    <Input
                      id="social-title"
                      value={state.title}
                      onChange={(event) =>
                        setState((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Amber glass roller, 9ml"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="social-link">Destination link</Label>
                    <Input
                      id="social-link"
                      value={state.linkUrl}
                      onChange={(event) =>
                        setState((current) => ({ ...current, linkUrl: event.target.value }))
                      }
                      placeholder="https://bestbottles.com/products/..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Media</Label>
                  <div className="flex flex-wrap gap-2">
                    {state.media.map((item) => (
                      <div key={item.url} className="group relative">
                        {item.type === "image" ? (
                          <img
                            src={item.url}
                            alt=""
                            className="h-20 w-20 rounded-md border object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted text-xs">
                            Video
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeMedia(item.url)}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Remove media"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed">
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <ImageLibraryPicker value="" onChange={addMedia} />
                  <p className="text-xs text-muted-foreground">
                    Media must sit on a public HTTPS URL — Instagram, Pinterest and TikTok download
                    it themselves rather than accepting an upload from us.
                  </p>
                </div>

                {selectedPlatforms.some((id) => SOCIAL_PLATFORMS[id].supportsFirstComment) && (
                  <div className="space-y-2">
                    <Label htmlFor="social-first-comment">First comment</Label>
                    <Textarea
                      id="social-first-comment"
                      rows={2}
                      value={state.firstComment}
                      onChange={(event) =>
                        setState((current) => ({ ...current, firstComment: event.target.value }))
                      }
                      placeholder="Hashtags or a spec link, posted as the first comment."
                    />
                  </div>
                )}
              </TabsContent>

              {/* Per channel ------------------------------------------- */}
              <TabsContent value="perChannel" className="space-y-4 pt-4">
                {plan.targets.map((target) => {
                  const spec = SOCIAL_PLATFORMS[target.platform];
                  const Icon = spec.icon;
                  const override = state.captionOverrides[target.platform];

                  return (
                    <div key={target.connectionId} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" style={{ color: spec.brandColor }} />
                          <span className="font-medium">{target.connectionLabel}</span>
                        </div>
                        <Badge variant={target.errors.length > 0 ? "destructive" : "secondary"}>
                          {target.errors.length > 0
                            ? `${target.errors.length} issue${target.errors.length === 1 ? "" : "s"}`
                            : `${target.media.length} media`}
                        </Badge>
                      </div>

                      {target.errors.map((error) => (
                        <Alert key={error} variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      ))}

                      {target.notes.map((note) => (
                        <Alert key={note}>
                          <Info className="h-4 w-4" />
                          <AlertDescription>{note}</AlertDescription>
                        </Alert>
                      ))}

                      {target.platform === "pinterest" && (
                        <PinterestBoardSelect
                          connectionId={target.connectionId}
                          value={(target.options.boardId as string) ?? ""}
                          onChange={(boardId) => setPlatformOption("pinterest", "boardId", boardId)}
                        />
                      )}

                      {target.platform === "tiktok" && (
                        <div className="space-y-2">
                          <Label>Privacy</Label>
                          <Select
                            value={(target.options.privacyLevel as string) ?? ""}
                            onValueChange={(value) =>
                              setPlatformOption("tiktok", "privacyLevel", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose who can see it" />
                            </SelectTrigger>
                            <SelectContent>
                              {TIKTOK_PRIVACY_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Anything other than private requires TikTok to have approved content
                            posting for this app.
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Caption for {spec.label}</Label>
                          {override !== undefined ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setState((current) => {
                                  const next = { ...current.captionOverrides };
                                  delete next[target.platform];
                                  return { ...current, captionOverrides: next };
                                })
                              }
                            >
                              Use shared caption
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setState((current) => ({
                                  ...current,
                                  captionOverrides: {
                                    ...current.captionOverrides,
                                    [target.platform]: captionFor(current, target.platform),
                                  },
                                }))
                              }
                            >
                              Customise
                            </Button>
                          )}
                        </div>
                        <Textarea
                          rows={4}
                          value={target.caption}
                          disabled={override === undefined}
                          onChange={(event) =>
                            setState((current) => ({
                              ...current,
                              captionOverrides: {
                                ...current.captionOverrides,
                                [target.platform]: event.target.value,
                              },
                            }))
                          }
                        />
                        <p
                          className={cn(
                            "text-xs",
                            target.caption.length > spec.captionMaxLength
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {target.caption.length} / {spec.captionMaxLength}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>

            {/* Timing ------------------------------------------------- */}
            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              <div className="space-y-2">
                <Label>When</Label>
                <Select
                  value={scheduleMode}
                  onValueChange={(value) => setScheduleMode(value as "now" | "schedule")}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Publish now</SelectItem>
                    <SelectItem value="schedule">Schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scheduleMode === "schedule" && (
                <div className="space-y-2">
                  <Label htmlFor="social-scheduled-at">Date and time</Label>
                  <Input
                    id="social-scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="w-60"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!plan.canPublish || submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : scheduleMode === "schedule" ? (
              <CalendarClock className="mr-2 h-4 w-4" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {scheduleMode === "schedule"
              ? `Schedule ${plan.targets.length || ""}`.trim()
              : `Publish ${plan.targets.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaptionMeters({
  caption,
  platforms,
}: {
  caption: string;
  platforms: SocialPlatformId[];
}) {
  if (platforms.length === 0) {
    return <p className="text-xs text-muted-foreground">Select a channel to see its limits.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {platforms.map((platform) => {
        const spec = SOCIAL_PLATFORMS[platform];
        const over = caption.length > spec.captionMaxLength;
        return (
          <span
            key={platform}
            className={over ? "text-destructive" : "text-muted-foreground"}
          >
            {spec.label} {caption.length}/{spec.captionMaxLength}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Boards come from the connection metadata captured at OAuth time, so opening
 * the composer does not cost a Pinterest API call.
 */
function PinterestBoardSelect({
  connectionId,
  value,
  onChange,
}: {
  connectionId: string;
  value: string;
  onChange: (boardId: string) => void;
}) {
  const { connections } = useSocialConnections();
  const connection = connections.find((item) => item.id === connectionId);
  const boards = (connection?.metadata?.boards ?? []) as Array<{ id: string; name: string }>;

  if (boards.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center gap-2">
          No boards were captured for this account. Reconnect Pinterest to refresh the board list.
          <ExternalLink className="h-3 w-3" />
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Board</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a board" />
        </SelectTrigger>
        <SelectContent>
          {boards.map((board) => (
            <SelectItem key={board.id} value={board.id}>
              {board.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function inferMediaKind(url: string): "image" | "video" {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? "video" : "image";
}

function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
