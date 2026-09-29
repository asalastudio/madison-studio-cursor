import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractFunctionErrorMessage } from "./edgeFunctionError.ts";

describe("extractFunctionErrorMessage", () => {
  it("keeps specific Shopify or Convex errors", async () => {
    await assert.equal(
      await extractFunctionErrorMessage(
        new Error("No Shopify variant found for SKU GB-CYL-CLR-5ML-SPR-SBLK."),
        "Unable to publish",
      ),
      "No Shopify variant found for SKU GB-CYL-CLR-5ML-SPR-SBLK.",
    );
  });

  it("rewrites a raw gateway 502 into an operator-facing publish failure", async () => {
    const message = await extractFunctionErrorMessage(
      {
        message: "Edge Function returned a non-2xx status code",
        context: {
          text: async () => "502 Internal Server Error",
        },
      },
      "Unable to publish",
    );
    assert.match(message, /gateway 502/i);
    assert.match(message, /authorization/i);
  });
});
