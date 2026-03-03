export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_MODEL = "models/gemini-2.5-flash";

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
};

interface GeminiRequestOptions {
  model?: string;
  systemPrompt?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  safetySettings?: Record<string, unknown>[];
}

interface GeminiTextOptions extends GeminiRequestOptions {
  chunkSize?: number;
}

function ensureGeminiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return key;
}

export function getGeminiApiKey(): string {
  return ensureGeminiKey();
}

function toArrayContent(content: OpenAIMessage["content"]): OpenAIContentPart[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  return [];
}

function convertDataUrl(
  url: string,
): { mimeType: string; data: string } | null {
  if (!url.startsWith("data:")) return null;
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = url.slice(5, commaIndex); // remove "data:"
  const data = url.slice(commaIndex + 1);
  const mimeType = meta.split(";")[0] || "application/octet-stream";
  return { mimeType, data };
}

function convertPart(part: OpenAIContentPart) {
  if (part.type === "text") {
    return { text: part.text };
  }
  if (part.type === "image_url" && part.image_url?.url) {
    const dataUrl = convertDataUrl(part.image_url.url);
    if (dataUrl) {
      return {
        inlineData: {
          mimeType: dataUrl.mimeType,
          data: dataUrl.data,
        },
      };
    }
    // Remote URLs are not supported yet; fall back to textual reference
    return { text: `Image reference: ${part.image_url.url}` };
  }
  return { text: "" };
}

function splitSystemMessages(messages: OpenAIMessage[], explicit?: string) {
  let systemPrompt = explicit || "";
  const chatMessages: OpenAIMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const parts = toArrayContent(message.content)
        .filter((part) => part.type === "text")
        .map((part) => (part as { type: "text"; text: string }).text)
        .filter(Boolean);
      if (parts.length > 0) {
        const combined = parts.join("\n");
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${combined}`
          : combined;
      }
    } else {
      chatMessages.push(message);
    }
  }

  return { systemPrompt, chatMessages };
}

function convertMessages(messages: OpenAIMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: toArrayContent(message.content).map(convertPart),
  }));
}

async function handleGeminiError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const errorMessage = json.error?.message || text;
    throw new Error(`Gemini API error: ${errorMessage}`);
  } catch {
    throw new Error(`Gemini API error (${response.status}): ${text}`);
  }
}

export async function generateGeminiContent(options: GeminiRequestOptions) {
  const apiKey = ensureGeminiKey();
  const { systemPrompt: explicitSystemPrompt, messages, ...rest } = options;
  const { systemPrompt, chatMessages } = splitSystemMessages(
    messages,
    explicitSystemPrompt,
  );

  const body: Record<string, unknown> = {
    contents: convertMessages(chatMessages),
    generationConfig: {
      temperature: rest.temperature ?? 0.7,
      topP: rest.topP ?? 0.95,
      topK: rest.topK,
      maxOutputTokens: rest.maxOutputTokens ?? 2048,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  // DISABLED: responseMimeType causes 400/500 errors with some models/API versions
  // if (rest.responseMimeType) {
  //   body.generationConfig.responseMimeType = rest.responseMimeType;
  // }

  if (rest.safetySettings) {
    body.safetySettings = rest.safetySettings;
  }

  if (!rest.topK) {
    delete (body.generationConfig as Record<string, unknown>).topK;
  }

  const model = rest.model ? `models/${rest.model.replace(/^models\//, "")}` : DEFAULT_MODEL;

  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleGeminiError(response);
  }

  return await response.json();
}

export function extractTextFromGeminiResponse(data: any): string {
  if (!data?.candidates?.length) return "";
  for (const candidate of data.candidates) {
    const parts = candidate?.content?.parts;
    if (Array.isArray(parts)) {
      const textParts = parts
        .filter((part: any) => typeof part.text === "string")
        .map((part: any) => part.text as string);
      if (textParts.length > 0) {
        return textParts.join("\n").trim();
      }
    }
  }
  return "";
}

function chunkText(text: string, chunkSize = 200) {
  if (!text) return [];
  const chunks: string[] = [];
  let pointer = 0;
  while (pointer < text.length) {
    chunks.push(text.slice(pointer, pointer + chunkSize));
    pointer += chunkSize;
  }
  return chunks;
}

export function createOpenAISSEStream(text: string, chunkSize = 200) {
  const encoder = new TextEncoder();
  const chunks = chunkText(text, chunkSize);

  return new ReadableStream({
    start(controller) {
      if (chunks.length === 0) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      for (const chunk of chunks) {
        const payload = {
          id: "chatcmpl-gemini",
          object: "chat.completion.chunk",
          created: Date.now(),
          choices: [
            {
              delta: { content: chunk },
              index: 0,
              finish_reason: null,
            },
          ],
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

export async function streamGeminiTextResponse(
  options: GeminiTextOptions,
  headers: HeadersInit,
) {
  const apiKey = ensureGeminiKey();
  const { systemPrompt: explicitSystemPrompt, messages, ...rest } = options;
  const { systemPrompt, chatMessages } = splitSystemMessages(
    messages,
    explicitSystemPrompt,
  );

  const body: Record<string, unknown> = {
    contents: convertMessages(chatMessages),
    generationConfig: {
      temperature: rest.temperature ?? 0.7,
      topP: rest.topP ?? 0.95,
      topK: rest.topK,
      maxOutputTokens: rest.maxOutputTokens ?? 2048,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  // DISABLED: responseMimeType causes 400/500 errors with some models/API versions
  // if (rest.responseMimeType) {
  //   body.generationConfig.responseMimeType = rest.responseMimeType;
  // }

  if (rest.safetySettings) {
    body.safetySettings = rest.safetySettings;
  }

  if (!rest.topK) {
    delete (body.generationConfig as Record<string, unknown>).topK;
  }

  const model = rest.model ? `models/${rest.model.replace(/^models\//, "")}` : DEFAULT_MODEL;

  // Use streaming API
  console.log(`[geminiClient] Calling Gemini API: ${model}:streamGenerateContent`);
  console.log(`[geminiClient] Request body size: ${JSON.stringify(body).length} chars`);

  const response = await fetch(
    `${GEMINI_API_BASE}/${model}:streamGenerateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  console.log(`[geminiClient] Gemini API response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[geminiClient] Gemini API error: ${errorText}`);
    // Parse error and throw directly
    try {
      const json = JSON.parse(errorText);
      const errorMessage = json.error?.message || errorText;
      throw new Error(`Gemini API error: ${errorMessage}`);
    } catch (parseError) {
      // If parsing fails, throw with the raw text
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }
  }

  console.log(`[geminiClient] Starting to process stream...`);

  // Convert Gemini streaming format to OpenAI SSE format
  const encoder = new TextEncoder();
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body from Gemini API");
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let buffer = "";

        let chunkCount = 0;
        let textChunkCount = 0;
        let totalBytesReceived = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[geminiClient] Stream ended. Total bytes: ${totalBytesReceived}, Chunks processed: ${chunkCount}, Text chunks: ${textChunkCount}`);
            // Process any remaining buffer content
            if (buffer.trim()) {
              try {
                const geminiData = JSON.parse(buffer.trim());
                chunkCount++;
                // Process this final chunk (same logic as below)
                let extractedText = "";
                const extractTextFromObject = (obj: any): string => {
                  if (typeof obj === 'string' && obj.trim()) return obj;
                  if (typeof obj !== 'object' || obj === null) return "";
                  if (obj.text && typeof obj.text === 'string' && obj.text.trim()) return obj.text;
                  if (Array.isArray(obj.parts)) {
                    const texts = obj.parts
                      .map((part: any) => {
                        if (typeof part === 'string') return part;
                        if (part?.text && typeof part.text === 'string') return part.text;
                        return "";
                      })
                      .filter((t: string) => t.trim());
                    if (texts.length > 0) return texts.join("");
                  }
                  for (const key in obj) {
                    if (key === 'text' || key === 'content' || key === 'parts') {
                      const found = extractTextFromObject(obj[key]);
                      if (found) return found;
                    }
                  }
                  return "";
                };
                if (geminiData.candidates?.[0]) {
                  const candidate = geminiData.candidates[0];
                  if (candidate.content?.parts) extractedText = extractTextFromObject(candidate.content);
                  if (!extractedText && candidate.delta?.content) extractedText = extractTextFromObject(candidate.delta.content);
                  if (!extractedText && candidate.content) extractedText = extractTextFromObject(candidate.content);
                }
                if (!extractedText) extractedText = extractTextFromObject(geminiData);
                if (extractedText && extractedText.trim()) {
                  textChunkCount++;
                  const openAIPayload = {
                    id: "chatcmpl-gemini",
                    object: "chat.completion.chunk",
                    created: Date.now(),
                    choices: [{ delta: { content: extractedText }, index: 0, finish_reason: null }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIPayload)}\n\n`));
                }
              } catch (e) {
                console.warn(`[geminiClient] Failed to parse final buffer: ${buffer.substring(0, 100)}`);
              }
            }
            console.log(`[geminiClient] Stream ended. Processed ${chunkCount} chunks, ${textChunkCount} with text`);
            break;
          }

          const decoded = decoder.decode(value, { stream: true });
          totalBytesReceived += value.length;
          buffer += decoded;

          // Log first few bytes to see what we're receiving
          if (chunkCount === 0 && totalBytesReceived < 1000) {
            console.log(`[geminiClient] First bytes received (${totalBytesReceived}):`, decoded.substring(0, 200));
          }

          // Process complete lines - but be more careful about JSON parsing
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (!line) continue;

            // Skip lines that are clearly incomplete JSON (start with partial tokens)
            if (line === '],' || line === '}' || line === ']' || line.startsWith('],')) {
              console.warn(`[geminiClient] Skipping incomplete JSON fragment: ${line}`);
              continue;
            }

            try {
              // Log raw line for first chunk to see what we're actually receiving
              if (chunkCount === 0) {
                console.log(`[geminiClient] Raw first line (first 500 chars):`, line.substring(0, 500));
              }

              const geminiData = JSON.parse(line);
              chunkCount++;

              // Log the full chunk structure for debugging (first chunk only to avoid spam)
              if (chunkCount === 1) {
                console.log(`[geminiClient] First chunk structure:`, JSON.stringify(geminiData, null, 2));
              }

              // Extract text from Gemini streaming format
              // Gemini streaming can return incremental updates in different structures
              let textExtracted = false;
              let extractedText = "";

              // Helper function to extract text from any nested structure
              const extractTextFromObject = (obj: any): string => {
                if (typeof obj === 'string' && obj.trim()) return obj;
                if (typeof obj !== 'object' || obj === null) return "";

                // Check for text field (direct)
                if (obj.text && typeof obj.text === 'string' && obj.text.trim()) {
                  return obj.text;
                }

                // Check for parts array (Gemini's standard format)
                if (Array.isArray(obj.parts)) {
                  const texts = obj.parts
                    .map((part: any) => {
                      // Part can be a string directly
                      if (typeof part === 'string') return part;
                      // Part can be an object with text property
                      if (part?.text && typeof part.text === 'string') return part.text;
                      // Part might be nested
                      if (typeof part === 'object') {
                        return extractTextFromObject(part);
                      }
                      return "";
                    })
                    .filter((t: string) => t && t.trim());
                  if (texts.length > 0) return texts.join("");
                }

                // Check for inlineData (skip image data)
                if (obj.inlineData) {
                  return ""; // Skip image data
                }

                // Recursively search in common fields
                const searchKeys = ['text', 'content', 'parts', 'delta'];
                for (const key of searchKeys) {
                  if (obj[key]) {
                    const found = extractTextFromObject(obj[key]);
                    if (found) return found;
                  }
                }

                return "";
              };

              // Strategy 1: Standard candidates format with content.parts
              if (geminiData.candidates?.[0]) {
                const candidate = geminiData.candidates[0];

                // IMPORTANT: In streaming mode, Gemini returns incremental text in content.parts
                // Each chunk may contain only the NEW text since the last chunk (delta)
                // OR it may contain the full accumulated content

                // Check content.parts (most common) - this is the standard format
                if (candidate.content?.parts) {
                  extractedText = extractTextFromObject(candidate.content);
                  if (chunkCount === 1 && !extractedText) {
                    console.log(`[geminiClient] Debug - candidate.content.parts exists but no text extracted. Parts:`, JSON.stringify(candidate.content.parts, null, 2));
                  }
                }

                // Check for content.text directly (some formats)
                if (!extractedText && candidate.content?.text) {
                  extractedText = typeof candidate.content.text === 'string' ? candidate.content.text : '';
                }

                // Check delta.content.parts (incremental updates - NEW in streaming)
                if (!extractedText && candidate.delta) {
                  // Delta can have content.parts or just text
                  if (candidate.delta.content?.parts) {
                    extractedText = extractTextFromObject(candidate.delta.content);
                  } else if (candidate.delta.text) {
                    extractedText = typeof candidate.delta.text === 'string' ? candidate.delta.text : '';
                  } else if (candidate.delta.content?.text) {
                    extractedText = typeof candidate.delta.content.text === 'string' ? candidate.delta.content.text : '';
                  }
                }

                // Check direct content field
                if (!extractedText && candidate.content) {
                  extractedText = extractTextFromObject(candidate.content);
                }

                // Check if content exists but is empty (might be a metadata chunk)
                if (!extractedText && candidate.content && !candidate.content.parts) {
                  console.log(`[geminiClient] Debug - candidate has content but no parts:`, JSON.stringify(candidate.content, null, 2));
                }
              } else {
                // No candidates - might be a different response format
                console.log(`[geminiClient] Debug - No candidates array. Top-level keys:`, Object.keys(geminiData));
              }

              // Strategy 2: Direct text in response
              if (!extractedText) {
                extractedText = extractTextFromObject(geminiData);
              }

              // If we found text, send it as OpenAI SSE format
              if (extractedText && extractedText.trim()) {
                textExtracted = true;
                textChunkCount++;
                const openAIPayload = {
                  id: "chatcmpl-gemini",
                  object: "chat.completion.chunk",
                  created: Date.now(),
                  choices: [
                    {
                      delta: { content: extractedText },
                      index: 0,
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(openAIPayload)}\n\n`),
                );
              } else {
                // Log chunks without text for debugging
                if (geminiData.candidates?.[0]?.finishReason) {
                  console.log(`[geminiClient] Finish chunk received: ${geminiData.candidates[0].finishReason}`);
                } else {
                  // Log the full structure of chunks without text so we can see what we're missing
                  console.warn(`[geminiClient] Chunk ${chunkCount} without extractable text. Full structure:`, JSON.stringify(geminiData, null, 2));

                  // Also log what we checked
                  console.warn(`[geminiClient] Debug - Has candidates:`, !!geminiData.candidates);
                  if (geminiData.candidates?.[0]) {
                    console.warn(`[geminiClient] Debug - Candidate 0 has content:`, !!geminiData.candidates[0].content);
                    console.warn(`[geminiClient] Debug - Candidate 0 has delta:`, !!geminiData.candidates[0].delta);
                    if (geminiData.candidates[0].content) {
                      console.warn(`[geminiClient] Debug - Content structure:`, JSON.stringify(geminiData.candidates[0].content, null, 2));
                    }
                  }
                }
              }

              // Check for finish reason
              if (geminiData.candidates?.[0]?.finishReason) {
                const finishReason = geminiData.candidates[0].finishReason;
                if (finishReason === "STOP" || finishReason === "MAX_TOKENS") {
                  const finalPayload = {
                    id: "chatcmpl-gemini",
                    object: "chat.completion.chunk",
                    created: Date.now(),
                    choices: [
                      {
                        delta: {},
                        index: 0,
                        finish_reason: finishReason === "STOP" ? "stop" : "length",
                      },
                    ],
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(finalPayload)}\n\n`),
                  );
                }
              }
            } catch (parseError) {
              // If JSON parse fails, it might be a partial line - put it back in buffer
              // But only if it looks like it could be part of JSON (not just random text)
              if (line.trim() && (line.includes('{') || line.includes('[') || line.includes('"') || line.includes('candidates'))) {
                // This looks like it might be part of a JSON object - put it back
                buffer = line + "\n" + buffer;
                // Break to wait for more data
                break;
              } else {
                // This doesn't look like JSON at all - skip it
                console.warn(`[geminiClient] Skipping non-JSON line: ${line.substring(0, 100)}`);
              }
            }
          }
        }

        // Send [DONE] marker
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: typeof headers === "object"
      ? { ...headers, "Content-Type": "text/event-stream" }
      : { "Content-Type": "text/event-stream" },
  });
}

export function convertContentToGeminiParts(
  content: OpenAIMessage["content"],
) {
  return toArrayContent(content).map(convertPart);
}
