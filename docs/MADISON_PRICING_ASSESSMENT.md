# Madison Studio — Pricing Structure Assessment

**Purpose:** Evaluate current pricing against SaaS value principles and recommend a tier structure.
**Reference:** Current tiers (Atelier / Studio / Maison), docs: MADISON_PRICING_V2_SETUP, PRODUCT-REQUIREMENTS-DOCUMENT, subscriptionTiers.ts.

---

## 1. Standard SaaS Value-Pricing Principles

| Principle | What It Means |
|-----------|----------------|
| **Price on value, not cost** | Charge for outcomes (content at scale, time saved, brand consistency) — not for your API/server costs. |
| **Segment by persona** | Tiers should map to Solo Creator → Growing Team → Brand/Org. |
| **Clear differentiators** | Each tier needs 2–3 obvious “why upgrade?” reasons (limits, features, support). |
| **Good–Better–Best** | 3 tiers; middle tier as default “recommended” drives most revenue. |
| **Usage that matches value** | If value = “content volume,” meter content/derivatives/images; if value = “team,” meter seats. |
| **Annual discount** | ~17–20% off monthly equivalent improves LTV and reduces churn. |
| **Add-ons for overage** | Let power users buy more (images, brands, seats) without forcing a full tier jump. |
| **Trial to reduce friction** | 14-day trial (as you have) is standard for consideration-stage buyers. |

---

## 2. Madison Studio — Full Feature Set (Value Map)

### Core value drivers (what you can charge for)

| Area | Features | Value narrative |
|------|----------|-----------------|
| **Brand intelligence** | Brand DNA upload, Health Score, Gap Wizard, visual standards for AI, product catalog | “One source of truth”; consistency at scale. |
| **Content creation** | Editorial Desk (single + master), blog/email/product/announcements, Madison chat (refinement) | Replaces copywriter/editor time; on-brand first draft + polish. |
| **Repurposing** | Multiply (Syndicate) — 6+ channel formats from one master | “Create once, publish everywhere”; huge time savings. |
| **Visual production** | Dark Room (AI images, editor, BG remove, library), Cutting Room (script/image → video) | Replaces freelance photo/video for product and social. |
| **Operations** | Library (Archives), Planner (Calendar), Google Calendar, prompt library | Organization and planning; less scattered tools. |
| **Distribution** | Shopify, Klaviyo, LinkedIn, Etsy, Sanity integrations | Distribution and syndication; “content → channels” in one place. |
| **Scale** | Multiple brands, products, team members, white-label, API | For agencies and multi-brand teams. |

### Supporting / table-stakes (included in base value)

- Dashboard, Brand Health, Ask Madison, Brand Quick View
- PDF/Word export, worksheet uploads
- Auth, RLS, org/team model

---

## 3. Rating Your Current Structure

### What’s working well

| Element | Rating | Notes |
|--------|--------|------|
| **Tier names** | ✅ Strong | Atelier / Studio / Maison fit a premium, brand-forward positioning. |
| **Three tiers** | ✅ Strong | Clear good–better–best; easy to explain. |
| **Usage-based limits** | ✅ Good | Master content, derivatives, images, Madison queries map to value. |
| **Add-ons** | ✅ Good | Extra images, brand slots, team packs, white-label, onboarding — capture overage and power users. |
| **Annual discount** | ✅ Good | ~17% (e.g. 2 months free) is in the right range. |
| **14-day trial** | ✅ Good | Reduces friction for consideration. |

### Gaps and risks

| Issue | Severity | Recommendation |
|-------|----------|-----------------|
| **Video (Cutting Room) not in tiers** | Medium | Once GA, add “video generations” or “video minutes” to limits and/or a dedicated add-on. |
| **Feature naming vs code** | Low | Docs say Atelier/Studio/Maison; code uses essentials/studio/signature. Align naming for clarity. |
| **Studio → Maison jump** | Medium | $199 → $599 is a big step. Consider a “Growth” tier at ~$349 or make Studio limits more generous so upgrade feels incremental. |
| **Value story per tier** | Medium | Landing/marketing should spell out outcomes (“X master pieces, Y derivatives, Z images”) not just feature lists. |
| **Image add-on pricing** | Low | $25/50, $45/100, $175/500 — check against FAL/API cost and competitor image packs; small tweaks if needed. |

### Overall rating: **B+**

- Structure is sound and aligned with value (content + visuals + distribution + scale).
- Main improvements: explicitly include video in the model, clarify tier naming in product, and either soften the $199→$599 jump or sharpen the value story for Maison.

---

## 4. Recommended Tier Structure (Value-Based)

### Option A — Keep three tiers, sharpen positioning (minimal change)

Keep **Atelier $49 / Studio $199 / Maison $599** and:

1. **Atelier — “Solo creator”**
   - Position as: “One brand, one voice — enough to run content for a single brand.”
   - Keep limits; add one clear outcome: e.g. “Up to 50 master pieces and 200 derivatives/month.”
   - Optional: add a small video allowance later (e.g. 5 videos/month) to differentiate from pure copy tools.

2. **Studio — “Growing team” (recommended)**
   - Position as: “Scale content and visuals across 3 brands and your team.”
   - Consider: slight bump in derivatives (e.g. 1,500) or images (125) so the step from Atelier feels substantial.
   - Call out: Multiply, Dark Room, integrations, 5 seats.

3. **Maison — “Brand operating system”**
   - Position as: “Unlimited content and derivatives; API, white-label, and priority support.”
   - Add: “Video generation” explicitly in the feature list and limits when Cutting Room is GA.
   - Consider: “Unlimited video generations” or a high cap (e.g. 100/month) as a differentiator.

4. **Add-ons**
   - Keep current add-ons.
   - When video is GA: add **“Extra video generations”** (e.g. 10 / 25 / 50 packs) priced per your video API cost + margin.

### Option B — Four tiers (if you want a gentler step from Studio to Maison)

| Tier | Monthly | Target | Differentiation |
|------|---------|--------|-----------------|
| **Atelier** | $49 | Solo creator | 1 brand, 50 master, 200 derivatives, 25 images, 500 queries. |
| **Studio** | $199 | Small team | 3 brands, unlimited master, 1K derivatives, 100 images, 2K queries, 5 seats, integrations. |
| **Maison** | $399 | Serious team/agency | Higher limits (e.g. 3K derivatives, 250 images, 5K queries), more brands/seats, white-label optional. |
| **Maison+** | $599 | Enterprise | Unlimited content/derivatives, API, white-label included, 10K queries, dedicated support. |

- Pro: smoother progression ($199 → $399 → $599).
- Con: more choices can dilute focus; only do this if you have real demand between $199 and $599.

### Option C — Align code and docs (naming)

- Use one set of tier names everywhere: either **Atelier / Studio / Maison** (marketing) or **Essentials / Studio / Signature** (product).
- Recommendation: **Atelier / Studio / Maison** in UI and docs; keep internal IDs (e.g. `essentials`, `studio`, `signature`) in code/DB if needed for stability.

---

## 5. How to Price It — Summary

- **Atelier $49** — Fair for solo creators; value = brand-in-one-place + limited content/visuals.
- **Studio $199** — Fair for teams; value = Multiply + Dark Room + integrations + multiple brands. Consider small limit increases to make the step from Atelier obvious.
- **Maison $599** — Justifiable for “brand operating system” + API + white-label + support; ensure video is included in the story and in limits when GA.
- **Add-ons** — Keep; add video packs when Cutting Room launches.
- **Annual** — Keep ~17% discount.
- **Trial** — Keep 14 days.

Overall: your pricing is already value-oriented and tiered sensibly. The biggest next steps are (1) explicitly folding **video** into tiers or add-ons, (2) aligning **tier names** across product and docs, and (3) tightening **positioning copy** (outcomes per tier) on the pricing page and in-app.

---

## 6. Quick Reference — Current vs Recommended (Option A)

| Tier | Current | Recommended (Option A) |
|------|---------|-------------------------|
| **Atelier** | $49; 50 master, 200 der., 25 img, 1 brand, 1 seat, 500 queries | Same; add outcome copy; optional 5 videos later. |
| **Studio** | $199; unlim. master, 1K der., 100 img, 3 brands, 5 seats, 2K queries | Same or +derivatives/images; “video” in feature list when GA. |
| **Maison** | $599; unlim. most, 500 img, 10K queries, API, white-label, support | Add explicit “video generation” (unlimited or high cap) when GA. |
| **Add-ons** | Images, brand slot, team pack, white-label, onboarding | Add “Extra video generations” when Cutting Room is GA. |

---

*Last updated: January 2026. Revisit when Cutting Room is generally available and after 2–3 months of conversion data.*
