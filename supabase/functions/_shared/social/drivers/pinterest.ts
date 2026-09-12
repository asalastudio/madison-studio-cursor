/**
 * Pinterest driver — v5 API.
 *
 * Pinterest is the one network in this set where the *destination link* is a
 * first-class field rather than something buried in a caption, which is why it
 * matters for a packaging catalogue: every pin points straight at a product page
 * and keeps working for years.
 */

import type {
  ConnectionRef,
  DiscoveredAccount,
  DriverDeps,
  PublishRequest,
  PublishResult,
  SocialDriver,
} from "./types.ts";
import { failure, readBody, summarize } from "./types.ts";

const API = "https://api.pinterest.com/v5";

export async function discoverPinterestAccounts(
  deps: DriverDeps,
  input: {
    accessToken: string;
    scopes: string[];
    tokenExpiresAt: string | null;
    refreshToken?: string | null;
    refreshTokenExpiresAt?: string | null;
  },
): Promise<{ accounts: DiscoveredAccount[] } | { error: string }> {
  const accountResponse = await deps.fetchImpl(`${API}/user_account`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const account = await readBody(accountResponse);

  if (!accountResponse.ok || !account.json?.username) {
    return {
      error: account.json?.message ?? account.text ?? "Could not read the Pinterest account.",
    };
  }

  // Boards are cached on the connection so the composer can offer a picker
  // without a round trip on every open.
  let boards: Array<{ id: string; name: string }> = [];
  const boardResponse = await deps.fetchImpl(`${API}/boards?page_size=100`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (boardResponse.ok) {
    const boardBody = await readBody(boardResponse);
    const items: any[] = Array.isArray(boardBody.json?.items) ? boardBody.json.items : [];
    boards = items
      .filter((item) => item?.id)
      .map((item) => ({ id: String(item.id), name: String(item.name ?? item.id) }));
  } else {
    deps.log("[pinterest] board listing failed", { status: boardResponse.status });
  }

  return {
    accounts: [
      {
        platform: "pinterest",
        accountType: "business",
        externalAccountId: String(account.json.username),
        externalAccountName: account.json.business_name ?? account.json.username,
        externalAccountHandle: String(account.json.username),
        externalAccountAvatarUrl: account.json.profile_image ?? null,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken ?? null,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        scopes: input.scopes,
        metadata: {
          accountType: account.json.account_type ?? null,
          boards,
        },
      },
    ],
  };
}

async function publishPinterest(
  request: PublishRequest,
  context: { accessToken: string; connection: ConnectionRef; deps: DriverDeps },
): Promise<PublishResult> {
  const { deps, accessToken } = context;

  const boardId =
    typeof request.options.boardId === "string" && request.options.boardId.length > 0
      ? request.options.boardId
      : (context.connection.metadata?.defaultBoardId as string | undefined);

  if (!boardId) {
    return failure("pinterest_board_missing", "Choose a Pinterest board before publishing.");
  }

  const image = request.media.find((item) => item.type === "image");
  if (!image) {
    return failure("media_required", "A Pinterest pin needs one image.");
  }

  const payload: Record<string, unknown> = {
    board_id: boardId,
    title: (request.title ?? "").slice(0, 100) || undefined,
    description: request.caption || undefined,
    alt_text: image.alt ?? undefined,
    link: request.linkUrl ?? undefined,
    media_source: { source_type: "image_url", url: image.url },
  };

  const response = await deps.fetchImpl(`${API}/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await readBody(response);
  if (!response.ok || !body.json?.id) {
    return failure(
      body.json?.code ? `pinterest_${body.json.code}` : "pinterest_error",
      body.json?.message ?? body.text ?? "Pinterest rejected the pin.",
      response.status,
      summarize(body.json ?? body.text),
    );
  }

  const pinId = String(body.json.id);
  return {
    ok: true,
    externalPostId: pinId,
    permalink: `https://www.pinterest.com/pin/${pinId}/`,
    responseSummary: summarize(body.json),
  };
}

export const pinterestDriver: SocialDriver = {
  platform: "pinterest",
  publish: publishPinterest,
};
