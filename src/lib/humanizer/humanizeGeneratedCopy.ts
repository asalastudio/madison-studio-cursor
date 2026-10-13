/**
 * Client-side humanizer. Same SKILL.md as the edge step, no skip flag.
 * Edge functions use supabase/functions/_shared/humanizer/humanize.ts instead.
 */
import Anthropic from "@anthropic-ai/sdk";
import humanizerSkill from "../../../supabase/functions/_shared/humanizer/SKILL.md?raw";
import {
  applyHumanizer,
  type HumanizerCompletion,
} from "../../../supabase/functions/_shared/humanizer/apply.ts";

async function completeWithClaude(input: HumanizerCompletion): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: input.maxOutputTokens,
    system: input.systemPrompt,
    messages: [{ role: "user", content: input.userPrompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("Humanizer returned empty copy");
  }
  return block.text;
}

export async function humanizeGeneratedCopy(text: string): Promise<string> {
  return applyHumanizer(text, humanizerSkill, completeWithClaude);
}
