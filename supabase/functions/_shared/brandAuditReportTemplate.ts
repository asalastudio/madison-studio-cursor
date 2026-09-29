// deno-lint-ignore-file no-explicit-any

export interface BrandAuditReport {
  coreIdentifiers: {
    clientName: string;
    brandName: string;
    domain: string;
    dateGenerated: string;
    logoUrl: string;
    tagline: string;
    brandDescription: string;
    heroQuote: string;
  };
  executiveSummaryData: {
    executiveSummary: string;
    topStrengths: string[];
    topRisks: string[];
    pullQuote: string;
  };
  brandIdentityDetails: {
    brandValues: string[];
    mission: string;
    vision: string;
    positioningStatement: string;
    brandArchetype: string;
    primaryAudience: string[];
    toneTraits: string[];
    voiceDescription: string;
  };
  visualLanguage: {
    colorPalette: { label: string; hex: string }[];
    typography: {
      headlineFont: string;
      bodyFont: string;
      usageNotes: string;
    };
    logoVariations: string[];
    moodboardImages: string[];
    iconographyStyle: string;
  };
  websiteDigitalScan: {
    websiteScreenshots: string[];
    websiteFindings: string;
    contentObservations: string[];
    priorityIssues: { issue: string; severity: string }[];
  };
  consistencyAndHealthScoring: {
    brandConsistencyScore: number;
    visualConsistencyScore: number;
    messageClarityScore: number;
    overallScore: number;
    scoreInsights: {
      brandConsistency: string[];
      visualConsistency: string[];
      messageClarity: string[];
    };
    chartData: { label: string; value: number }[];
  };
  recommendationsAndRoadmap: {
    quickWins: string[];
    strategicInitiatives: { phase: string; items: string[] }[];
    roadmapTimeline: { phaseName: string; timeHorizon: string; actions: string[] }[];
    recommendationNarrative: string;
  };
  contentKnowledgeAssets: {
    documentsAnalyzed: string[];
    contentGaps: string[];
    essentialFiveStatus: string;
    aiReadiness: string;
    brandHealthStatus: string;
  };
  footerMetadata: {
    preparedBy: string;
    pageNumber: string;
    disclaimer: string;
    nextSteps: string;
  };
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const renderList = (items: string[], tag = "li"): string =>
  items.map((item) => `<${tag}>${escapeHtml(item)}</${tag}>`).join("");

const renderPills = (items: string[]): string =>
  items.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");

const renderColorPalette = (colors: { label: string; hex: string }[]): string =>
  colors
    .map(
      (color) => `
      <div class="swatch-block">
        <div class="swatch" style="background:${escapeHtml(color.hex)};"></div>
        <div class="swatch-label">${escapeHtml(color.label)}</div>
        <div class="swatch-hex">${escapeHtml(color.hex)}</div>
      </div>
    `,
    )
    .join("");

const renderImages = (images: string[]): string =>
  images
    .map(
      (img) => `
      <div class="moodboard-item" style="background-image:url('${escapeHtml(img)}');"></div>
    `,
    )
    .join("");

const renderScreenshots = (images: string[]): string =>
  images
    .map(
      (img) => `
      <div class="screenshot" style="background-image:url('${escapeHtml(img)}');"></div>
    `,
    )
    .join("");

const renderIssues = (issues: { issue: string; severity: string }[]): string =>
  issues
    .map(
      (issue) => `
      <div class="issue-item">
        <div>${escapeHtml(issue.issue)}</div>
        <div class="severity-badge">${escapeHtml(issue.severity)}</div>
      </div>
    `,
    )
    .join("");

const renderScoreInsights = (insights: string[]): string => renderList(insights);

const renderBarChart = (data: { label: string; value: number }[]): string =>
  data
    .map(
      (item) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(item.label)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.min(Math.max(item.value, 0), 100)}%;"></div>
      </div>
      <div>${item.value}</div>
    </div>
  `,
    )
    .join("");

const renderStrategicInitiatives = (items: { phase: string; items: string[] }[]): string =>
  items
    .map(
      (entry) => `
      <div class="card">
        <div class="card-label">Phase</div>
        <div class="card-value">${escapeHtml(entry.phase)}</div>
        <ul>${renderList(entry.items)}</ul>
      </div>
    `,
    )
    .join("");

const renderTimeline = (
  items: { phaseName: string; timeHorizon: string; actions: string[] }[],
): string =>
  items
    .map(
      (entry) => `
      <div class="timeline-item">
        <div class="timeline-phase">${escapeHtml(entry.phaseName)}</div>
        <div class="timeline-time">${escapeHtml(entry.timeHorizon)}</div>
        <ul>${renderList(entry.actions)}</ul>
      </div>
    `,
    )
    .join("");

export const renderBrandAuditReport = (report: BrandAuditReport): string => {
  const {
    coreIdentifiers,
    executiveSummaryData,
    brandIdentityDetails,
    visualLanguage,
    websiteDigitalScan,
    consistencyAndHealthScoring,
    recommendationsAndRoadmap,
    contentKnowledgeAssets,
    brandAssets,
    footerMetadata,
  } = report;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Madison Studio – Brand Audit</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-bone: #F0E5D3;
      --text-black: #1a1a1a;
      --text-header: #000000;
      --border-color: #bfaea8; /* or rgba(0,0,0,0.1) */
      --accent-gold: #C29B5C;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 60px; /* "Breathing room" around the page */
      background-color: var(--bg-bone);
      color: var(--text-black);
      font-family: "Lato", "Inter", sans-serif;
      font-weight: 400;
      font-size: 13px;
      line-height: 1.7;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      margin: 0;
      size: auto;
    }

    /* --- TYPOGRAPHY --- */
    h1, h2, h3, h4, h5 {
      font-family: "Playfair Display", serif;
      color: var(--text-header);
      margin: 0;
    }

    /* Big Editorial Headers */
    .display-header {
      font-size: 48px;
      font-style: italic;
      font-weight: 500;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 24px;
    }
    
    .section-header {
      font-size: 32px;
      font-weight: 400;
      margin-bottom: 24px;
    }

    /* Overlines (The "Luxury" small caps) */
    .overline {
      font-family: "Inter", sans-serif;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #555;
      margin-bottom: 16px;
      display: block;
    }

    /* --- DNA GRID (2x2) --- */
    .dna-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 32px;
      margin-top: 24px;
    }
    .dna-item {
      margin-bottom: 16px;
    }
    .dna-value {
      font-family: "Playfair Display", serif;
      font-size: 20px;
      font-style: italic;
      color: var(--text-black);
      margin-top: 8px;
    }

    /* --- STYLE GUIDE CARD --- */
    .style-card {
      background: #F8F4EC;
      border: 1px solid var(--border-color);
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    
    /* --- CIRCULAR LOADER (CSS only) --- */
    .circular-loader {
      position: relative;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 1px solid rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .loader-value {
      font-family: "Inter", sans-serif;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #888;
    }
    .score-label-small {
      font-family: "Inter", sans-serif;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-top: 12px;
      text-align: center;
    }

    p { margin-bottom: 16px; max-width: 65ch; }

    /* --- ASSET GRID --- */
    .assets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .asset-card {
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 180px;
    }
    .asset-thumbnail {
      width: 100%;
      height: 120px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid rgba(0,0,0,0.08);
    }
    .asset-placeholder {
      width: 100%;
      height: 120px;
      border-radius: 4px;
      border: 1px dashed rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #777;
      background: rgba(0,0,0,0.02);
    }
    .asset-meta {
      font-size: 11px;
      line-height: 1.4;
    }
    .asset-name {
      font-family: "Playfair Display", serif;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .asset-type {
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #666;
      font-size: 10px;
    }
    .asset-empty {
      border: 1px dashed rgba(0,0,0,0.2);
      border-radius: 4px;
      padding: 24px;
      text-align: center;
      color: #777;
      font-size: 12px;
    }

    /* --- BENTO GRID LAYOUT SYSTEM --- */
    .grid-container {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 32px; /* Increased from 24px */
      margin-bottom: 48px;
    }

    .col-12 { grid-column: span 12; }
    .col-8 { grid-column: span 8; }
    .col-6 { grid-column: span 6; }
    .col-4 { grid-column: span 4; }
    .col-3 { grid-column: span 3; }

    /* Prevent page breaks inside boxes */
    .editorial-box, .grid-container, .style-card {
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Editorial Box: 1px border, padding, no shadow */
    .editorial-box {
      border: 1px solid var(--border-color);
      padding: 40px; /* Increased from 32px */
      background: transparent; /* Let the bone color shine through */
      display: flex;
      flex-direction: column;
      justify-content: flex-start; /* Align top */
    }

    /* --- COVER / HERO SECTION --- */
    .hero-section {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 80px; /* Increased from 60px */
      padding-bottom: 60px;
      page-break-after: always; /* Force page break after hero to start fresh */
    }

    .hero-logo {
      font-family: "Inter", sans-serif;
      font-size: 14px;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      margin-bottom: 16px;
      font-weight: 600;
    }

    .hero-sub {
      font-family: "Playfair Display", serif;
      font-style: italic;
      font-size: 18px;
      color: #666;
      margin-bottom: 40px;
    }

    .hero-quote {
      font-family: "Playfair Display", serif;
      font-size: 42px;
      line-height: 1.2;
      max-width: 800px;
      margin: 0 auto;
      font-style: italic;
    }

    /* --- COMPONENTS --- */
    
    /* Transparent Pills / Lists for Tone Traits */
    .trait-list {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .trait-pill {
      border: 1px solid var(--border-color);
      padding: 6px 16px;
      border-radius: 100px; /* Full pill */
      font-family: "Playfair Display", serif;
      font-style: italic;
      font-size: 14px;
      color: var(--text-black);
      background: transparent;
    }

    /* Swatches */
    .swatch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
      gap: 12px;
    }
    .swatch-circle {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 1px solid rgba(0,0,0,0.1);
      margin-bottom: 8px;
    }

    /* Scorecard */
    .score-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      padding-bottom: 12px;
    }
    .score-label {
      font-family: "Inter", sans-serif;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .score-bar-bg {
      width: 100px;
      height: 2px;
      background: rgba(0,0,0,0.1);
      position: relative;
    }
    .score-bar-fill {
      height: 100%;
      background: var(--text-black);
    }
    .score-num {
      font-family: "Playfair Display", serif;
      font-size: 16px;
      width: 30px;
      text-align: right;
    }

    /* Footer */
    footer {
      margin-top: 80px;
      border-top: 1px solid var(--border-color);
      padding-top: 24px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #666;
    }

    /* Utilities */
    .text-large { font-size: 18px; line-height: 1.5; }
    .mb-0 { margin-bottom: 0; }
    .mt-4 { margin-top: 24px; }

  </style>
</head>
<body>

  <!-- A. HERO SECTION -->
  <div class="hero-section">
    <div class="hero-logo">${escapeHtml(coreIdentifiers.brandName).toUpperCase()}</div>
    <div class="hero-sub">Brand Audit Report // ${escapeHtml(coreIdentifiers.dateGenerated.split('-')[0])}</div>
    <div class="hero-quote">
      “${escapeHtml(coreIdentifiers.heroQuote || "Intimacy, memory, craft, personal, evolving.")}”
    </div>
  </div>

  <!-- B. BRAND IDENTITY (The Lover) -->
  <div style="height: 40px; width: 100%; display: block;"></div> <!-- Safe Zone Spacer -->
  <div class="grid-container">
    <!-- Left: Positioning Statement -->
    <div class="col-6 editorial-box">
      <span class="overline">Positioning</span>
      <div class="display-header" style="font-size: 28px; margin-bottom: 0; line-height: 1.4;">
        ${escapeHtml(brandIdentityDetails.positioningStatement || "A clear positioning statement will appear here after the brand scan completes.")}
      </div>
    </div>

    <!-- Right: Brand DNA Grid -->
    <div class="col-6 editorial-box">
      <span class="overline">Brand DNA</span>
      <div class="dna-grid">
        <div class="dna-item">
          <span class="overline" style="margin-bottom: 4px;">Archetype</span>
          <div class="dna-value">${escapeHtml(brandIdentityDetails.brandArchetype || "The Lover")}</div>
        </div>
        <div class="dna-item">
          <span class="overline" style="margin-bottom: 4px;">Values</span>
          <div class="dna-value" style="font-size: 16px; font-style: normal; font-family: 'Inter'; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">
            ${(brandIdentityDetails.brandValues.length ? brandIdentityDetails.brandValues : ["Intimacy", "Memory", "Craft", "Authenticity"]).join(" • ")}
          </div>
        </div>
        <div class="dna-item col-12" style="grid-column: span 2;">
          <span class="overline" style="margin-bottom: 4px;">Audience</span>
          <div class="dna-value" style="font-size: 14px; font-family: 'Inter'; font-style: normal; margin-top: 4px;">
            Individuals seeking personal, intimate fragrance experiences.
          </div>
        </div>
      </div>
      
      <div class="mt-4" style="border-top: 1px solid rgba(0,0,0,0.05); padding-top: 20px;">
        <span class="overline">Tone Traits</span>
        <div style="font-family: 'Playfair Display', serif; font-style: italic; font-size: 16px; color: #444;">
          ${(brandIdentityDetails.toneTraits.length ? brandIdentityDetails.toneTraits : ["Intimate", "Sensual", "Sophisticated", "Artisanal"]).join(", ")}
        </div>
      </div>
    </div>
  </div>

  <!-- C. VISUAL SYSTEM & SCORES -->
  <div class="grid-container">
    <!-- Visual System (Style Card) -->
    <div class="col-4 style-card">
      <span class="overline">Visual System</span>
      
      <!-- Colors -->
      <div>
        <div class="overline" style="margin-bottom: 8px;">Palette</div>
        <div style="display: flex; gap: 12px;">
           ${visualLanguage.colorPalette.length > 0 ? visualLanguage.colorPalette.slice(0,3).map(c => `
             <div style="width: 40px; height: 40px; background: ${c.hex}; border: 1px solid rgba(0,0,0,0.1); border-radius: 50%;"></div>
           `).join('') : 
           `<div style="width: 40px; height: 40px; background: #000000; border-radius: 50%;"></div>
            <div style="width: 40px; height: 40px; background: #F0E5D3; border: 1px solid rgba(0,0,0,0.1); border-radius: 50%;"></div>`
           }
        </div>
      </div>

      <!-- Typography -->
      <div>
        <div class="overline" style="margin-bottom: 8px;">Typography</div>
        <div style="font-family: 'Playfair Display', serif; font-size: 24px; margin-bottom: 4px;">Ag <span style="font-size: 12px; font-family: 'Inter'; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 8px;">Playfair</span></div>
        <div style="font-family: 'Inter', sans-serif; font-size: 24px;">Aa <span style="font-size: 12px; font-family: 'Inter'; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 8px;">Inter</span></div>
      </div>
    </div>

    <!-- Scorecard (Circular Loaders) -->
    <div class="col-8 editorial-box" style="align-items: center; justify-content: center;">
      <div style="width: 100%; text-align: center; margin-bottom: 24px;">
        <span class="overline">Baseline Analysis</span>
      </div>
      <div style="display: flex; justify-content: space-around; width: 100%; padding: 0 40px;">
        ${consistencyAndHealthScoring.chartData.map(item => `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div class="circular-loader">
              <div class="loader-value">${item.value}%</div>
            </div>
            <div class="score-label-small">${item.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <!-- D. EXECUTIVE SUMMARY & RECOMMENDATIONS (Full Width) -->
  <div class="grid-container">
    <div class="col-12 editorial-box">
      <span class="overline">Executive Summary</span>
      <p class="text-large" style="margin-top: 16px; margin-bottom: 32px; line-height: 1.8;">${escapeHtml(executiveSummaryData.executiveSummary)}</p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding-top: 24px; border-top: 1px solid rgba(0,0,0,0.05);">
        <div>
          <span class="overline" style="margin-bottom: 16px;">Key Strengths</span>
          <ul style="margin: 0; padding-left: 16px; font-family: 'Inter', sans-serif; line-height: 1.8;">
            ${executiveSummaryData.topStrengths.length > 0 
              ? executiveSummaryData.topStrengths.map(s => `<li style="margin-bottom: 8px;">${escapeHtml(s)}</li>`).join('')
              : '<li>Clear brand aesthetic</li><li>Strong visual foundation</li>'}
          </ul>
        </div>
        <div>
          <span class="overline" style="margin-bottom: 16px;">Areas for Growth</span>
          <ul style="margin: 0; padding-left: 16px; font-family: 'Inter', sans-serif; line-height: 1.8;">
            ${executiveSummaryData.topRisks.length > 0 
              ? executiveSummaryData.topRisks.map(r => `<li style="margin-bottom: 8px;">${escapeHtml(r)}</li>`).join('')
              : '<li>Refine value proposition</li><li>Expand content pillars</li>'}
          </ul>
        </div>
      </div>
    </div>
  </div>

  <!-- E. STRATEGIC ROADMAP & CONTENT GAPS -->
  <div class="grid-container">
    <!-- Left: Roadmap -->
    <div class="col-8 editorial-box">
      <span class="overline">Strategic Roadmap</span>
      <div style="margin-top: 24px; flex-grow: 1;">
        ${recommendationsAndRoadmap.roadmapTimeline.length > 0 
          ? recommendationsAndRoadmap.roadmapTimeline.map(phase => `
            <div style="display: flex; gap: 32px; margin-bottom: 32px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 24px;">
              <div style="width: 140px; flex-shrink: 0;">
                <div style="font-family: 'Playfair Display', serif; font-style: italic; font-size: 18px; margin-bottom: 4px;">${escapeHtml(phase.phaseName)}</div>
                <div class="overline" style="font-size: 9px; color: #888;">${escapeHtml(phase.timeHorizon)}</div>
              </div>
              <div style="flex: 1;">
                <ul style="margin: 0; padding-left: 16px; line-height: 1.6;">
                  ${phase.actions.map(action => `<li style="margin-bottom: 6px;">${escapeHtml(action)}</li>`).join('')}
                </ul>
              </div>
            </div>
          `).join('')
          : `<div style="height: 100%; min-height: 200px; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #888; border: 1px dashed rgba(0,0,0,0.1); border-radius: 4px;">
               <div style="font-family: 'Playfair Display', serif; font-style: italic; font-size: 18px; margin-bottom: 8px;">Analysis Pending</div>
               <div style="font-family: 'Inter', sans-serif; font-size: 11px;">Roadmap data will appear here after full strategy generation.</div>
             </div>`
        }
      </div>
    </div>

    <!-- Right: Content Gaps -->
    <div class="col-4 editorial-box">
      <span class="overline">Content Gaps</span>
      <ul style="margin-top: 24px; padding-left: 16px; line-height: 1.8; margin-bottom: 32px;">
        ${contentKnowledgeAssets.contentGaps.length > 0 
          ? contentKnowledgeAssets.contentGaps.map(gap => `<li style="margin-bottom: 8px;">${escapeHtml(gap)}</li>`).join('')
          : '<li>Founder story</li><li>Product education</li><li>Brand manifesto</li>'
        }
      </ul>
      
      <div style="border-top: 1px solid rgba(0,0,0,0.05); padding-top: 24px; margin-top: auto;">
        <span class="overline">Quick Wins</span>
        <ol style="margin-top: 16px; padding-left: 16px; line-height: 1.8;">
          ${recommendationsAndRoadmap.quickWins.length > 0 
            ? recommendationsAndRoadmap.quickWins.slice(0,3).map(win => `<li style="margin-bottom: 8px;">${escapeHtml(win)}</li>`).join('')
            : '<li>Audit social bio</li><li>Update hero imagery</li>'
          }
        </ol>
      </div>
    </div>
  </div>

  <!-- F. DIGITAL PRESENCE (Optional Screenshot Grid) -->
  <div class="editorial-box" style="min-height: 300px; margin-bottom: 48px;">
    <span class="overline">Digital Presence</span>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 16px;">
       ${websiteDigitalScan.websiteScreenshots.length > 0 
         ? renderScreenshots(websiteDigitalScan.websiteScreenshots).replace(/class="screenshot"/g, 'class="screenshot" style="height: 200px; background-size: cover; border: 1px solid rgba(0,0,0,0.1);"')
         : `<div style="height: 200px; background: rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; font-style: italic;">No Capture Available</div>`
       }
    </div>
    <div style="margin-top: 24px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 16px;">
      <span class="overline">Key Findings</span>
      <p>${escapeHtml(websiteDigitalScan.websiteFindings || "No findings recorded.")}</p>
    </div>
  </div>

  <!-- G. BRAND ASSETS -->
  <div class="editorial-box" style="margin-bottom: 48px;">
    <span class="overline">Brand Assets Library</span>
    <div class="assets-grid">
      ${brandAssets.length
        ? brandAssets
            .map(
              (asset) => `
        <div class="asset-card">
          ${
            asset.fileUrl && asset.fileType?.startsWith("image/")
              ? `<img src="${asset.fileUrl}" alt="${asset.fileName}" class="asset-thumbnail" />`
              : `<div class="asset-placeholder">${asset.fileType?.split("/")[0]?.toUpperCase() || "DOC"}</div>`
          }
          <div class="asset-meta">
            <div class="asset-name">${asset.fileName}</div>
            <div class="asset-type">${asset.fileType}</div>
            ${asset.uploadedAt ? `<div>${asset.uploadedAt.split("T")[0]}</div>` : ""}
          </div>
        </div>
      `,
            )
            .join("")
        : `<div class="asset-empty">No brand assets uploaded yet. Upload guidelines, logos, or photography to enrich this report.</div>`}
    </div>
  </div>

  <!-- FOOTER -->
  <footer>
    <div>Generated by Madison Studio</div>
    <div>Brand Health ${escapeHtml(contentKnowledgeAssets.brandHealthStatus)}</div>
  </footer>

</body>
</html>`;
};
