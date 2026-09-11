import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRACTICES: { title: string; detail: string }[] = [
  {
    title: "Lighting, not layout",
    detail:
      "Use references for light direction, softness, and color temperature — not for copying exact composition or crop.",
  },
  {
    title: "One mood per reference",
    detail:
      "Avoid collages. One clear image = one coherent mood so the model doesn’t average conflicting cues.",
  },
  {
    title: "Match the finish you want",
    detail:
      "Pick references whose material language matches your goal: matte vs gloss, warm vs cool, soft vs specular.",
  },
  {
    title: "Resolution & sharpness",
    detail:
      "Crisp, well-exposed images transfer better than soft JPEGs or heavy compression artifacts.",
  },
  {
    title: "Skin-tone and grade",
    detail:
      "For beauty, references with believable skin rendering and grade similar to your brand beat random stock.",
  },
  {
    title: "Background complexity",
    detail:
      "If the hero is the bottle, prefer references with simpler backgrounds so the model doesn’t fight your scene.",
  },
  {
    title: "Shadow vocabulary",
    detail:
      "Notice contact shadow depth and falloff — references teach edge softness and grounding, not fake float.",
  },
  {
    title: "Color palette discipline",
    detail:
      "Limit dominant hues in the reference; rainbow scenes rarely pair cleanly with controlled pack shots.",
  },
  {
    title: "Avoid text and logos",
    detail:
      "References with readable type or logos can leak into generations — crop or choose cleaner frames.",
  },
  {
    title: "Consistent era / genre",
    detail:
      "Don’t mix 90s flash with ultra-minimal 2020s studio in the same brief unless you intend a mashup.",
  },
  {
    title: "Label in Dark Room",
    detail:
      "Upload as Style Reference (not Product) so Madison routes it to the style bucket, not multi-product composite.",
  },
  {
    title: "Tag style-reference outputs",
    detail:
      "When you deliberately generate a mood board for reuse, use “Style reference output” so it lands in the Style filter in Image Library.",
  },
];

interface StyleReferenceGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StyleReferenceGuideModal({ open, onOpenChange }: StyleReferenceGuideModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Style reference — best practices</DialogTitle>
          <DialogDescription className="text-[color-mix(in_srgb,var(--darkroom-text)_70%,transparent)] text-sm">
            Twelve guidelines for choosing and using style references in Dark Room. References steer lighting,
            mood, and material language — not a second product to composite.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <ol className="list-decimal list-inside space-y-4 text-sm text-[color-mix(in_srgb,var(--darkroom-text)_90%,transparent)]">
            {PRACTICES.map((p, i) => (
              <li key={i} className="leading-relaxed">
                <span className="font-medium text-[var(--darkroom-text)]">{p.title}.</span>{" "}
                {p.detail}
              </li>
            ))}
          </ol>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
