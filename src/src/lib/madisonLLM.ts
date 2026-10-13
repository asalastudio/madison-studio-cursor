// src/lib/madisonLLM.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { buildMadisonPrompt } from "./madisonPrompt";
import { humanizeGeneratedCopy } from "@/lib/humanizer/humanizeGeneratedCopy";

// --- ENVIRONMENT KEYS ---
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY!;
const GEMINI_KEY = process.env.GEMENI_API_KEY!;

// --- MODEL NAMES ---
const CLAUDE_MODEL = "claude-3-5-sonnet-latest";
const GEMINI_TEXT_MODEL = "gemini-2.0-pro";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash";

// --- INITIAL CLIENTS ---
const claude = new Anthropic({ apiKey: CLAUDE_KEY });
const gemini = new GoogleGenerativeAI(GEMINI_KEY);

const madisonSystemPrompt = buildMadisonPrompt();

/**
 * MAIN UNIFIED LLM: Use Claude first, fallback to Gemini automatically.
 */
export async function madisonText(
  userMessage: string
): Promise<string> {
  try {
    // 1️⃣ PRIMARY — CLAUDE FOR COPYWRITING & STRATEGY
    const completion = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.6,
      system: madisonSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const output =
      completion?.content?.[0]?.text ??
      completion?.content?.[0] ??
      "";

    if (output.trim().length > 0) return humanizeGeneratedCopy(output.trim());
  } catch (err) {
    console.log("❌ Claude failed — falling back to Gemini");
  }

  // 2️⃣ FALLBACK — GEMINI PRO (text)
  try {
    const model = gemini.getGenerativeModel({ model: GEMINI_TEXT_MODEL });
    const result = await model.generateContent(userMessage);
    return humanizeGeneratedCopy(result.response.text().trim());
  } catch (err) {
    console.error("❌ Gemini fallback also failed", err);
    return "Madison: I’m having trouble responding right now.";
  }
}

/**
 * IMAGE GENERATION — ALWAYS GEMINI 2.5 FLASH
 */
export async function madisonImage(prompt: string): Promise<string> {
  try {
    const model = gemini.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });
    const result = await model.generateImage(prompt);

    // Returns Base64 URI
    return result.response.image.base64Data;
  } catch (e) {
    console.error("❌ Image generation failed", e);
    throw new Error("Madison: I couldn't create that image.");
  }
}