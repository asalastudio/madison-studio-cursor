/**
 * Mandatory humanizer for Supabase edge functions.
 *
 * Vendored from https://github.com/blader/humanizer @ 19fc634 (MIT).
 * See ./SKILL.md and ./LICENSE. Copyright (c) 2025 Siqi Chen.
 *
 * humanizeGeneratedCopy(text) is the only entry. It always uses SKILL.md and
 * always calls the model. It does not accept a skip flag and it does not
 * return the draft when the model fails.
 */
import { generateText } from "../aiProviders.ts";
import { applyHumanizer, type TextCompleter } from "./apply.ts";
import skillText from "./SKILL.md" with { type: "text" };

const complete: TextCompleter = (input) =>
  generateText({
    systemPrompt: input.systemPrompt,
    prompt: input.userPrompt,
    maxOutputTokens: input.maxOutputTokens,
  });

export async function humanizeGeneratedCopy(text: string): Promise<string> {
  return applyHumanizer(text, skillText, complete);
}
