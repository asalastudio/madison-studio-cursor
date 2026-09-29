import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRepurposeBlogRequest, extractRepurposeBlogResult } from "./repurposeBlogRequest";

describe("repurposeBlogRequest", () => {
  const post = {
    id: "master-1",
    title: "Spring attar notes",
    full_content: "A long journal piece about sandalwood.",
  };

  it("sends the Multiply / repurpose-content shape", () => {
    assert.deepEqual(buildRepurposeBlogRequest(post), {
      masterContentId: "master-1",
      derivativeTypes: ["product"],
      masterContent: { full_content: post.full_content },
    });
  });

  it("reads generated_content from the first derivative", () => {
    assert.deepEqual(
      extractRepurposeBlogResult(
        { success: true, derivatives: [{ generated_content: "Short product copy." }] },
        post,
      ),
      { title: "Spring attar notes", description: "Short product copy.", tags: [] },
    );
  });
});
