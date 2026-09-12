/**
 * PublishToSocial — the button that opens the composer, prefilled from whatever
 * content the user is looking at.
 *
 * Drop it next to any piece of content (a Multiply derivative, a library card,
 * a Dark Room render) to send that content out.
 */

import { useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SocialComposer } from "@/components/social/SocialComposer";
import type { ComposerMedia } from "@/lib/social/composerPlan";

export interface PublishToSocialProps {
  content: string;
  media?: ComposerMedia[];
  linkUrl?: string;
  scheduledFor?: Date | null;
  scheduledContentId?: string | null;
  masterContentId?: string | null;
  derivativeAssetId?: string | null;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  buttonText?: string;
  className?: string;
  onPublished?: () => void;
}

export function PublishToSocial({
  content,
  media = [],
  linkUrl = "",
  scheduledFor = null,
  scheduledContentId = null,
  masterContentId = null,
  derivativeAssetId = null,
  variant = "outline",
  size = "sm",
  buttonText = "Post to social",
  className,
  onPublished,
}: PublishToSocialProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Share2 className={size === "icon" ? "h-4 w-4" : "mr-2 h-4 w-4"} />
        {size !== "icon" && buttonText}
      </Button>

      <SocialComposer
        open={open}
        onOpenChange={setOpen}
        initialCaption={content}
        initialMedia={media}
        initialLinkUrl={linkUrl}
        initialScheduledFor={scheduledFor}
        scheduledContentId={scheduledContentId}
        masterContentId={masterContentId}
        derivativeAssetId={derivativeAssetId}
        onPublished={onPublished}
      />
    </>
  );
}
