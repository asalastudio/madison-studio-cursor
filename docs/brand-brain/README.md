# Best Bottles — Brand Brain

This directory holds reference copies of the Best Bottles brand foundation, version-controlled alongside the app. These documents are the canonical source of truth for anything Best Bottles content-generation-related — copy voice, image aesthetic, forbidden phrases, pricing discipline, Grace persona contract.

## How they're used today

- **`generate-with-claude` edge function** reads the `madison_system_config` table (populated via the Madison Training tab in org settings) and injects those fields into Claude's system prompt on every text-generation call. If the brand brain has been pasted into settings, it flows here.
- **`madison_training_documents` table** stores uploaded brand docs (PDF/TXT/MD). `generate-with-claude` injects up to 5 of them verbatim into prompts (truncated per-doc).
- **`generate-madison-image` edge function** — previously did NOT read either table. A follow-up commit wires it so brand voice/quality/forbidden-phrase content reaches image prompts too.

The physical source of truth lives in Google Drive; the Google Doc linked below is the one the team keeps up-to-date. Copies here are checkpoints — re-sync when the Google Doc changes in ways you want to lock.

## Files

- [best-bottles-v2-grace.md](./best-bottles-v2-grace.md) — **v2.0, dated 2025-12-17, fetched 2026-03-24.** This is the version that currently powers Grace (the customer-facing chatbot on bestbottles.com). Authoritative reference for Grace's persona, the "never quote exact prices" rule, forbidden/approved phrasing, and the simpler first-pass color palette.

## Version currently NOT checked in

- **v3.0 (Madison Studio import, dated 2026-04-22)** lives in a Google Doc and supersedes v2 on every substantive point (larger catalog, split image pipelines, four editorial collections, eight-authors copywriter routing, Paper Doll separation rule). To check in: copy from the Drive source and save as `best-bottles-v3-madison.md` in this directory.

## Source of truth pointer

Google Drive: `https://docs.google.com/document/d/1GdEF4CF9Lb4oTBhqaVJfjPqDs_XYbPa7KsT5TQwPGbA/edit`

## When to re-sync

Re-export from Google Drive and overwrite the local checkpoint whenever:
- Forbidden/approved phrasing changes
- Pricing tiers shift
- Visual system (Muted Luxury) palette or photography direction is updated
- Grace persona contract changes
- The Madison Studio v3 version updates (collections, copywriter routing, Paper Doll rules)

Commit the re-sync as a standalone commit so history shows when brand language shifted — useful when debugging older generated content that doesn't match newer guidelines.
