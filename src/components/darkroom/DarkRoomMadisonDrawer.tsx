import { useState } from "react";
import {
  Bookmark,
  ImageIcon,
  Loader2,
  MessageSquareQuote,
  Sparkles,
  Wand2,
} from "lucide-react";
import { EditorialAssistantPanel } from "@/components/assistant/EditorialAssistantPanel";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { madison } from "@/lib/madisonToast";

interface AssistantSessionContext {
  sessionId: string;
  sessionName: string;
  imagesGenerated: number;
  maxImages: number;
  heroImage?: {
    imageUrl: string;
    prompt: string;
  };
  allPrompts: string[];
  aspectRatio: string;
  outputFormat: string;
  isImageStudio: boolean;
  visualStandards?: unknown;
  brandName?: string;
  organizationId?: string;
}

interface ReferenceAsset {
  label: string;
  url: string;
}

interface DarkRoomMadisonDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile?: boolean;
  currentPrompt: string;
  sessionContext: AssistantSessionContext;
  referenceAssets: ReferenceAsset[];
  heroImageUrl?: string | null;
  onUsePrompt: (prompt: string) => void;
  onSavePrompt: (prompt: string, suggestedTitle?: string) => void;
}

interface DraftRequest {
  nonce: number;
  text?: string;
  images?: string[];
  autoSubmit?: boolean;
}

function buildSuggestedTitle(prompt: string) {
  const cleaned = prompt
    .replace(/[`*_#>\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Dark Room Prompt";

  const shortTitle = cleaned.split(" ").slice(0, 6).join(" ");
  return shortTitle.length > 52 ? `${shortTitle.slice(0, 49).trim()}...` : shortTitle;
}

function extractPromptCandidate(content: string) {
  const fencedBlocks = [...content.matchAll(/```(?:prompt|text|md|markdown)?\n([\s\S]*?)```/gi)];
  if (fencedBlocks.length > 0) {
    const firstBlock = fencedBlocks[0]?.[1]?.trim();
    if (firstBlock) return firstBlock;
  }

  const finalPromptMatch = content.match(/(?:final prompt|recommended prompt|production-ready prompt)\s*:?\s*([\s\S]+)/i);
  if (finalPromptMatch?.[1]?.trim()) {
    return finalPromptMatch[1].trim();
  }

  return content.trim();
}

async function imageUrlToDataUrl(url: string) {
  if (url.startsWith("data:")) return url;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to read image (${response.status})`);
  }

  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Unable to convert image"));
    };
    reader.onerror = () => reject(new Error("Unable to convert image"));
    reader.readAsDataURL(blob);
  });
}

export function DarkRoomMadisonDrawer({
  open,
  onOpenChange,
  isMobile = false,
  currentPrompt,
  sessionContext,
  referenceAssets,
  heroImageUrl,
  onUsePrompt,
  onSavePrompt,
}: DarkRoomMadisonDrawerProps) {
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const canAnalyzeReferences = referenceAssets.length > 0;
  const canCritiqueHero = Boolean(heroImageUrl);
  const hasPrompt = currentPrompt.trim().length > 0;

  const queuePrompt = async (actionKey: string, text: string, imageUrls: string[] = []) => {
    setPendingAction(actionKey);

    try {
      const images = imageUrls.length > 0
        ? await Promise.all(imageUrls.map((url) => imageUrlToDataUrl(url)))
        : undefined;

      setDraftRequest({
        nonce: Date.now(),
        text,
        images,
        autoSubmit: true,
      });
    } catch (error) {
      console.error("Failed to prepare Madison action:", error);
      madison.error(
        "Madison could not load those references",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveCurrentPrompt = () => {
    const promptCandidate = extractPromptCandidate(currentPrompt);
    if (!promptCandidate) {
      madison.info("Write a prompt first");
      return;
    }
    onSavePrompt(promptCandidate, buildSuggestedTitle(promptCandidate));
  };

  const topContent = (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-[var(--darkroom-text-dim)]">
              Creative Director
            </p>
            <h4 className="mt-1 text-[15px] font-semibold text-[var(--darkroom-text)]">
              Madison helps shape stronger Dark Room prompts.
            </h4>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--darkroom-text-muted)]">
              Ask for hero prompts, image critique, and tighter variations. When something is ready,
              send it straight back into the prompt box or save it to the Librarian.
            </p>
          </div>
          <div className="rounded-full border border-[var(--darkroom-accent)]/20 bg-[var(--darkroom-accent)]/10 p-2 text-[var(--darkroom-accent)]">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--darkroom-text-dim)]">
                Current Brief
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--darkroom-text-muted)]">
                {hasPrompt ? currentPrompt : "No prompt written yet. Madison can build one from your references and session context."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSaveCurrentPrompt}
              disabled={!hasPrompt}
              className="h-8 shrink-0 border border-white/[0.08] bg-white/[0.03] text-[11px] text-[var(--darkroom-text)] hover:bg-white/[0.06]"
            >
              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
              Save Prompt
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            queuePrompt(
              "hero-prompt",
              `Create one polished Dark Room hero-image prompt for this session. Use the current brief if helpful, and use any attached references plus the session context. Respond with:\n\nFinal Prompt:\n\`\`\`prompt\n<one production-ready image prompt>\n\`\`\`\n\nWhy it works:\n- 2 short bullets\n- 2 short bullets`,
              referenceAssets.map((asset) => asset.url)
            )
          }
          disabled={pendingAction !== null}
          className="h-auto min-h-[84px] w-full overflow-hidden items-start justify-start rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left text-[var(--darkroom-text)] hover:bg-white/[0.06]"
        >
          <Wand2 className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-[var(--darkroom-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block whitespace-normal break-words text-[12px] font-medium leading-5">Write Hero Prompt</span>
            <span className="mt-1 block whitespace-normal break-words text-[11px] leading-relaxed text-[var(--darkroom-text-muted)]">
              Build a clean production-ready prompt from the current setup.
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            queuePrompt(
              "improve-prompt",
              `Improve this Dark Room prompt without losing the core idea.\n\nCurrent prompt:\n"${currentPrompt}"\n\nRespond with:\n\nImproved Prompt:\n\`\`\`prompt\n<one tighter image prompt>\n\`\`\`\n\nUpgrades:\n- 3 short bullets`
            )
          }
          disabled={!hasPrompt || pendingAction !== null}
          className="h-auto min-h-[84px] w-full overflow-hidden items-start justify-start rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left text-[var(--darkroom-text)] hover:bg-white/[0.06]"
        >
          <Sparkles className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-[var(--darkroom-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block whitespace-normal break-words text-[12px] font-medium leading-5">Improve My Prompt</span>
            <span className="mt-1 block whitespace-normal break-words text-[11px] leading-relaxed text-[var(--darkroom-text-muted)]">
              Tighten lighting, composition, and product storytelling.
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            queuePrompt(
              "reference-analysis",
              `Analyze the attached reference images for composition, lighting, mood, materials, and brand fit. Then suggest one best Dark Room prompt.\n\nRespond with:\n\nWhat to Keep:\n- bullets\n\nWhat to Adjust:\n- bullets\n\nRecommended Prompt:\n\`\`\`prompt\n<one production-ready prompt>\n\`\`\``,
              referenceAssets.map((asset) => asset.url)
            )
          }
          disabled={!canAnalyzeReferences || pendingAction !== null}
          className="h-auto min-h-[84px] w-full overflow-hidden items-start justify-start rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left text-[var(--darkroom-text)] hover:bg-white/[0.06]"
        >
          <ImageIcon className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-[var(--darkroom-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block whitespace-normal break-words text-[12px] font-medium leading-5">Analyze References</span>
            <span className="mt-1 block whitespace-normal break-words text-[11px] leading-relaxed text-[var(--darkroom-text-muted)]">
              Read the uploaded images and turn them into clearer direction.
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            queuePrompt(
              "hero-critique",
              `Critique the attached Dark Room generation like a creative director. Focus on composition, lighting, realism, product emphasis, and what prompt changes would improve the next take.\n\nRespond with:\n\nStrongest Elements:\n- bullets\n\nFix Next:\n- bullets\n\nNext Prompt:\n\`\`\`prompt\n<one stronger follow-up prompt>\n\`\`\``,
              heroImageUrl ? [heroImageUrl] : []
            )
          }
          disabled={!canCritiqueHero || pendingAction !== null}
          className="h-auto min-h-[84px] w-full overflow-hidden items-start justify-start rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left text-[var(--darkroom-text)] hover:bg-white/[0.06]"
        >
          <MessageSquareQuote className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-[var(--darkroom-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block whitespace-normal break-words text-[12px] font-medium leading-5">Critique Latest Frame</span>
            <span className="mt-1 block whitespace-normal break-words text-[11px] leading-relaxed text-[var(--darkroom-text-muted)]">
              Review the current hero image and recommend a stronger next prompt.
            </span>
          </span>
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={() =>
          queuePrompt(
            "prompt-variations",
            `Using this Dark Room brief, give me 3 distinct image prompt variations that feel intentionally different in composition and lighting while still fitting the brand.\n\nBrief:\n"${currentPrompt || sessionContext.heroImage?.prompt || "Use the session context and references to infer the creative brief."}"\n\nFormat each one like:\nVariation 1\n\`\`\`prompt\n<prompt>\n\`\`\`\nWhy it works:\n- bullet`,
            referenceAssets.map((asset) => asset.url)
          )
        }
        disabled={pendingAction !== null}
        className="h-auto min-h-[84px] w-full overflow-hidden justify-start rounded-xl border border-white/[0.08] bg-[var(--darkroom-accent)]/10 px-3 py-3 text-left text-[var(--darkroom-text)] hover:bg-[var(--darkroom-accent)]/15"
      >
        {pendingAction ? (
          <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-[var(--darkroom-accent)]" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4 shrink-0 text-[var(--darkroom-accent)]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block whitespace-normal break-words text-[12px] font-medium leading-5">Suggest 3 Better Variations</span>
          <span className="mt-1 block whitespace-normal break-words text-[11px] leading-relaxed text-[var(--darkroom-text-muted)]">
            Explore three stronger directions without leaving the Dark Room.
          </span>
        </span>
      </Button>
    </div>
  );

  const assistant = (
    <EditorialAssistantPanel
      onClose={() => onOpenChange(false)}
      sessionContext={sessionContext}
      darkMode
      topContent={topContent}
      draftRequest={draftRequest}
      onUseMessage={(content) => onUsePrompt(extractPromptCandidate(content))}
      useMessageLabel="Use in Dark Room"
      onSaveMessage={(content) => {
        const promptCandidate = extractPromptCandidate(content);
        onSavePrompt(promptCandidate, buildSuggestedTitle(promptCandidate));
      }}
      saveMessageLabel="Save to Librarian"
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92vh] border-[var(--darkroom-border)] bg-[var(--camera-body)] p-0">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Madison Dark Room Edition</DrawerTitle>
            <DrawerDescription>
              A creative direction drawer for building prompts, analyzing images, and saving prompt ideas.
            </DrawerDescription>
          </DrawerHeader>
          {assistant}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="[&>button]:hidden w-full max-w-none border-[var(--darkroom-border)] bg-[var(--camera-body)] p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Madison Dark Room Edition</SheetTitle>
          <SheetDescription>
            A creative direction drawer for building prompts, analyzing images, and saving prompt ideas.
          </SheetDescription>
        </SheetHeader>
        {assistant}
      </SheetContent>
    </Sheet>
  );
}
