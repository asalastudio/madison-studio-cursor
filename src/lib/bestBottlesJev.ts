/**
 * Jev (TypeSafe System One) — typed judgment calls for the Best Bottles rig.
 *
 * Jev answers atomic typed questions against a text state and returns a
 * distribution plus a confidence. It is TEXT ONLY: images, audio and video are
 * not supported, so nothing here can look at a rendered hero. Visual QA stays
 * with the geometric detectors in `rigPostprocess` and with Jordan's review.
 *
 * Scope discipline (decided 2026-09-18): Jev PROPOSES, the deterministic
 * resolvers stay the authority. `resolveShoulderLock` still owns glass-body
 * assignment at generation time and still fails closed on unknown bodies; the
 * shoulder/width QA stays a measurement. Jev is for the manual triage that
 * gates new families — which SKUs share a glass body, which catalog rows
 * contradict themselves — where a human currently reads rows one at a time.
 */

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

/** Below this, the answer is a suggestion for a human, never an input to the rig. */
export const JEV_REVIEW_CONFIDENCE = 0.5;
/** At or above this, an answer may drive a reversible automated decision. */
export const JEV_AUTO_CONFIDENCE = 0.85;

export type JevState = string | Record<string, string | number | null> | string[];

export type JevChoiceQuestion = {
  type: "choice";
  instructions: string;
  /** Option name → description. Max 255 options; include an escape hatch. */
  criteria: Record<string, string | null>;
};

export type JevNoulQuestion = {
  type: "noul";
  instructions: string;
};

export type JevScoreQuestion = {
  type: "score";
  instructions: string;
  /** Ordinal scale, lowest first. */
  criteria: string[];
};

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion | JevScoreQuestion;

export type JevAnswer = {
  type: "choice" | "score" | "noul";
  choice?: string;
  score?: number;
  noul?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type JevResponse<K extends string = string> = {
  model: string;
  answers: Record<K, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export class JevError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "JevError";
  }
}

export type AskJevOptions = {
  apiKey?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export function resolveJevApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    throw new JevError(
      "TYPESAFE_API_KEY is not set. The Best Bottles website repo carries it in .env.local; " +
        "copy it into Madison's environment before running Jev-backed triage.",
    );
  }
  return key;
}

/**
 * One call, many questions. Every question is evaluated in parallel against the
 * same state and in isolation from the others, so batching questions is free —
 * batching *states* is not, and callers should bound their own concurrency.
 */
export async function askJev<K extends string>(
  state: JevState,
  questions: Record<K, JevQuestion>,
  options: AskJevOptions = {},
): Promise<JevResponse<K>> {
  const keys = Object.keys(questions) as K[];
  if (keys.length === 0) throw new JevError("askJev needs at least one question");
  for (const key of keys) {
    const question = questions[key];
    if (question.type === "choice" && Object.keys(question.criteria).length > 255) {
      throw new JevError(`Choice question "${key}" exceeds the 255-option limit`);
    }
  }

  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(JEV_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey ?? resolveJevApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: JEV_MODEL, state, questions }),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new JevError(`Jev returned ${response.status}: ${body.slice(0, 300)}`, response.status);
  }

  const payload = (await response.json()) as JevResponse<K>;
  if (!payload?.answers) throw new JevError("Jev response carried no answers");
  for (const key of keys) {
    if (!(key in payload.answers)) throw new JevError(`Jev omitted an answer for "${key}"`);
  }
  return payload;
}

export type JevRouting = "auto" | "confirm" | "review";

/**
 * Confidence measures the shape of the distribution, NOT the probability of
 * being right, so it is a routing signal and never a correctness claim. A
 * missing confidence routes to review rather than defaulting to auto.
 */
export function routeByConfidence(
  confidence: number | null | undefined,
  thresholds: { auto?: number; review?: number } = {},
): JevRouting {
  const auto = thresholds.auto ?? JEV_AUTO_CONFIDENCE;
  const review = thresholds.review ?? JEV_REVIEW_CONFIDENCE;
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "review";
  if (confidence < review) return "review";
  if (confidence < auto) return "confirm";
  return "auto";
}
