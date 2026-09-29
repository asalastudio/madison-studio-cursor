import {
  createPaperDollActionContext,
  databaseError,
  jsonResponse,
  requireRecord,
  requireString,
  runPaperDollAction,
  sha256Hex,
} from "../_shared/paperDollEdge.ts";
import {
  buildSanityMutation,
  validatePublicPublicationRequest,
} from "../_shared/paperDollLifecycle.ts";
import { assertBestBottlesSanityOrg, writeSanityDocument } from "../_shared/paperDollSanity.ts";

Deno.serve((request) =>
  runPaperDollAction(request, async () => {
    const body = requireRecord(await request.json());
    const organizationId = requireString(body.organizationId, "organizationId");
    assertBestBottlesSanityOrg(organizationId);
    const releaseCutId = requireString(body.releaseCutId, "releaseCutId");
    const documentId = requireString(body.documentId, "documentId");
    const approvedByName = requireString(body.approvedByName, "approvedByName");
    const approvalNote = requireString(body.approvalNote, "approvalNote");
    const expectedDraftRequestSha256 = requireString(
      body.expectedDraftRequestSha256,
      "expectedDraftRequestSha256",
    );
    const document = requireRecord(body.document, "document");
    const downstreamScopeConfirmed = body.downstreamScopeConfirmed === true;
    const context = await createPaperDollActionContext(request, organizationId);

    const { data: head, error: headError } = await context.service
      .from("paper_doll_release_heads")
      .select("current_release_cut_id")
      .eq("organization_id", organizationId)
      .eq("current_release_cut_id", releaseCutId)
      .maybeSingle();
    if (headError || !head) {
      databaseError(
        headError,
        "Only the Current Release can be publicly published.",
      );
    }

    const draftOperation = buildSanityMutation({
      action: "draft",
      documentId,
      document,
    });
    const draftRequestSha256 = await sha256Hex(draftOperation.document);
    if (draftRequestSha256 !== expectedDraftRequestSha256) {
      databaseError(
        null,
        "The reviewed Sanity draft content changed before publication.",
      );
    }
    const { data: successfulDraft, error: draftError } = await context.service
      .from("paper_doll_sanity_syncs")
      .select(
        "id, release_cut_id, approved_by_user_id, approved_by_display_name",
      )
      .eq("organization_id", organizationId)
      .eq("release_cut_id", releaseCutId)
      .eq("sync_action", "draft")
      .eq("sync_status", "success")
      .eq("request_sha256", draftRequestSha256)
      .maybeSingle();
    if (draftError) {
      databaseError(draftError, "Successful draft lookup failed.");
    }

    validatePublicPublicationRequest({
      userId: context.user.id,
      organizationMember: true,
      approvedByName,
      approvalNote,
      downstreamScopeConfirmed,
      releaseCutId,
      successfulDraftReleaseCutId: successfulDraft?.release_cut_id ?? null,
    });

    const operation = buildSanityMutation({
      action: "public",
      documentId,
      document,
    });
    const requestSha256 = await sha256Hex({
      document: operation.document,
      draftRequestSha256,
      downstreamScopeConfirmed,
      approvedByName,
      approvalNote,
    });
    const { data: prior, error: priorError } = await context.service
      .from("paper_doll_sanity_syncs")
      .select("id, sync_status, result")
      .eq("organization_id", organizationId)
      .eq("release_cut_id", releaseCutId)
      .eq("sync_action", "public")
      .eq("request_sha256", requestSha256)
      .maybeSingle();
    if (priorError) {
      databaseError(priorError, "Public publication ledger lookup failed.");
    }
    if (prior?.sync_status === "success") {
      return jsonResponse(200, {
        syncId: prior.id,
        releaseCutId,
        documentId: operation.documentId,
        status: "success",
        idempotent: true,
        publicPublished: true,
        result: prior.result,
      });
    }
    if (prior?.sync_status === "queued") {
      databaseError(null, "This public publication is already queued.");
    }

    const { data: sync, error: syncError } = await context.service
      .from("paper_doll_sanity_syncs")
      .insert({
        organization_id: organizationId,
        release_cut_id: releaseCutId,
        sanity_document_id: operation.documentId,
        sync_action: "public",
        sync_status: "queued",
        request_sha256: requestSha256,
        approved_by_user_id: context.user.id,
        approved_by_display_name: approvedByName,
        approval_note: approvalNote,
        result: {
          successfulDraftSyncId: successfulDraft!.id,
          draftRequestSha256,
        },
      })
      .select("id")
      .single();
    if (syncError || !sync) {
      databaseError(syncError, "Public publication could not be queued.");
    }

    try {
      const result = await writeSanityDocument(operation.document);
      const { error: completeError } = await context.service
        .from("paper_doll_sanity_syncs")
        .update({
          sync_status: "success",
          result: {
            ...result,
            successfulDraftSyncId: successfulDraft!.id,
            draftRequestSha256,
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", sync.id)
        .eq("sync_status", "queued");
      if (completeError) {
        databaseError(
          completeError,
          "Public publication result could not be recorded.",
        );
      }

      const { data: cutAssets, error: assetsError } = await context.service
        .from("paper_doll_release_cut_assets")
        .select("component_candidate_id")
        .eq("organization_id", organizationId)
        .eq("release_cut_id", releaseCutId)
        .not("component_candidate_id", "is", null);
      if (assetsError) {
        databaseError(
          assetsError,
          "Release candidate membership could not be read.",
        );
      }
      const candidateIds = [
        ...new Set(
          (cutAssets ?? []).map((asset) =>
            String(asset.component_candidate_id)
          ),
        ),
      ];
      for (const candidateId of candidateIds) {
        const { data: advanced, error: advanceError } = await context.service
          .from("paper_doll_component_candidates")
          .update({ lifecycle_state: "published" })
          .eq("id", candidateId)
          .eq("organization_id", organizationId)
          .eq("lifecycle_state", "sanity-draft")
          .select("id")
          .maybeSingle();
        if (advanceError || !advanced) {
          databaseError(
            advanceError,
            "Candidate publication state could not be advanced.",
          );
        }
        const { error: eventError } = await context.service.from(
          "paper_doll_approval_events",
        ).insert({
          organization_id: organizationId,
          candidate_id: candidateId,
          action: "published",
          approver_user_id: context.user.id,
          approver_display_name: approvedByName,
          approval_note: approvalNote,
          evidence: {
            releaseCutId,
            syncId: sync.id,
            successfulDraftSyncId: successfulDraft!.id,
            downstreamScopeConfirmed,
            sanityRevision: result.revision,
          },
        });
        if (eventError) {
          databaseError(
            eventError,
            "Publication approval event could not be appended.",
          );
        }
      }
      return jsonResponse(200, {
        syncId: sync.id,
        releaseCutId,
        documentId: operation.documentId,
        revision: result.revision,
        status: "success",
        idempotent: false,
        publicPublished: true,
      });
    } catch (error) {
      await context.service.from("paper_doll_sanity_syncs").update({
        sync_status: "failed",
        error_message: error instanceof Error
          ? error.message
          : "Public Sanity publication failed.",
        completed_at: new Date().toISOString(),
      }).eq("id", sync.id).eq("sync_status", "queued");
      throw error;
    }
  })
);
