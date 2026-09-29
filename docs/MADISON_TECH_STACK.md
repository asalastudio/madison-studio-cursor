# Madison Studio - Complete Tech Stack

## 📋 Overview

This document provides a comprehensive summary of every technology, framework, library, service, and tool used in the Madison Studio application.

---

## 🎯 Core Framework & Runtime

### **Frontend Framework**
- **React** `^18.3.1` - UI library
- **React DOM** `^18.3.1` - DOM rendering
- **TypeScript** `^5.8.3` - Type-safe JavaScript
- **Node.js** `20.x` - Runtime environment

### **Build Tools**
- **Vite** `^5.4.19` - Build tool and dev server
- **@vitejs/plugin-react-swc** `^3.11.0` - React plugin with SWC compiler
- **SWC** - Fast Rust-based compiler (via plugin)

### **Development Tools**
- **ESLint** `^9.32.0` - Code linting
- **TypeScript ESLint** `^8.38.0` - TypeScript-specific linting
- **Lovable Tagger** `^1.1.10` - Component tagging (dev mode)

---

## 🎨 UI Framework & Styling

### **CSS Framework**
- **Tailwind CSS** `^3.4.17` - Utility-first CSS framework
- **PostCSS** `^8.5.6` - CSS processing
- **Autoprefixer** `^10.4.21` - CSS vendor prefixing
- **@tailwindcss/typography** `^0.5.16` - Typography plugin

### **UI Component Library**
- **Radix UI** - Headless UI components:
  - `@radix-ui/react-accordion` `^1.2.11`
  - `@radix-ui/react-alert-dialog` `^1.1.14`
  - `@radix-ui/react-aspect-ratio` `^1.1.7`
  - `@radix-ui/react-avatar` `^1.1.10`
  - `@radix-ui/react-checkbox` `^1.3.2`
  - `@radix-ui/react-collapsible` `^1.1.11`
  - `@radix-ui/react-context-menu` `^2.2.15`
  - `@radix-ui/react-dialog` `^1.1.14`
  - `@radix-ui/react-dropdown-menu` `^2.1.15`
  - `@radix-ui/react-hover-card` `^1.1.14`
  - `@radix-ui/react-label` `^2.1.7`
  - `@radix-ui/react-menubar` `^1.1.15`
  - `@radix-ui/react-navigation-menu` `^1.2.13`
  - `@radix-ui/react-popover` `^1.1.14`
  - `@radix-ui/react-progress` `^1.1.7`
  - `@radix-ui/react-radio-group` `^1.3.7`
  - `@radix-ui/react-scroll-area` `^1.2.9`
  - `@radix-ui/react-select` `^2.2.5`
  - `@radix-ui/react-separator` `^1.1.7`
  - `@radix-ui/react-slider` `^1.3.5`
  - `@radix-ui/react-slot` `^1.2.3`
  - `@radix-ui/react-switch` `^1.2.5`
  - `@radix-ui/react-tabs` `^1.1.12`
  - `@radix-ui/react-toast` `^1.2.14`
  - `@radix-ui/react-toggle` `^1.1.9`
  - `@radix-ui/react-toggle-group` `^1.1.10`
  - `@radix-ui/react-tooltip` `^1.2.7`

### **UI Utilities**
- **Shadcn/UI** - Component system built on Radix UI
- **class-variance-authority** `^0.7.1` - Component variant management
- **clsx** `^2.1.1` - Conditional className utility
- **tailwind-merge** `^2.6.0` - Merge Tailwind classes
- **tailwindcss-animate** `^1.0.7` - Animation utilities

### **Icons**
- **Lucide React** `^0.545.0` - Icon library
- **@untitledui/icons** `^0.0.19` - Additional icon set

### **Animation**
- **Framer Motion** `^12.23.22` - Animation library

---

## 📝 Rich Text Editing

### **Tiptap Editor**
- **@tiptap/react** `^3.13.0` - React wrapper for Tiptap
- **@tiptap/starter-kit** `^3.13.0` - Essential extensions
- **@tiptap/extension-link** `^3.13.0` - Link extension
- **@tiptap/extension-placeholder** `^3.13.0` - Placeholder extension
- **@tiptap/extension-bubble-menu** `^3.13.0` - Bubble menu
- **@tiptap/extension-task-item** `^3.14.0` - Task list items
- **@tiptap/extension-task-list** `^3.14.0` - Task lists

### **Markdown**
- **react-markdown** `^10.1.0` - Markdown renderer
- **remark-gfm** `^4.0.1` - GitHub Flavored Markdown

---

## 🗄️ Database & Backend

### **Backend-as-a-Service**
- **Supabase** - Full-stack backend platform
  - PostgreSQL database
  - Authentication (Supabase Auth)
  - Storage (S3-compatible)
  - Edge Functions (Deno runtime)
  - Real-time subscriptions
  - Row Level Security (RLS)

### **Database Client**
- **@supabase/supabase-js** `^2.58.0` - Supabase JavaScript client

### **Edge Functions Runtime**
- **Deno** - Runtime for Supabase Edge Functions
- **TypeScript** - Edge function development

---

## 🔄 State Management & Data Fetching

### **Data Fetching**
- **@tanstack/react-query** `^5.83.0` - Server state management
  - Caching
  - Background refetching
  - Optimistic updates

### **Form Management**
- **react-hook-form** `^7.61.1` - Form state management
- **@hookform/resolvers** `^3.10.0` - Form validation resolvers
- **zod** `^3.25.76` - Schema validation

---

## 🛣️ Routing & Navigation

### **Routing**
- **react-router-dom** `^6.30.1` - Client-side routing
  - Browser router
  - Route guards
  - Navigation state

---

## 🎨 Layout & Drag-and-Drop

### **Dashboard Layout**
- **react-grid-layout** `^2.1.0` - Responsive grid layout system
- **react-resizable-panels** `^2.1.9` - Resizable panel groups

### **Drag-and-Drop**
- **@dnd-kit/core** `^6.3.1` - Drag-and-drop core
- **@dnd-kit/sortable** `^10.0.0` - Sortable components
- **@dnd-kit/utilities** `^3.2.2` - DnD utilities
- **react-beautiful-dnd** `^13.1.1` - Alternative DnD library (legacy)

---

## 📅 Date & Time

### **Date Utilities**
- **date-fns** `^3.6.0` - Date manipulation library
- **react-day-picker** `^8.10.1` - Date picker component

---

## 📊 Data Visualization

### **Charts**
- **Recharts** `^2.15.4` - Charting library
  - Line charts
  - Bar charts
  - Pie charts
  - Area charts

---

## 📄 Document Generation

### **PDF Generation**
- **@react-pdf/renderer** `^4.3.1` - React-to-PDF renderer
- **jspdf** `^3.0.3` - PDF generation
- **jspdf-autotable** `^5.0.2` - PDF table generation

### **Word Documents**
- **docx** `^9.5.1` - Word document generation

---

## 🖼️ Image Processing

### **Image Libraries**
- **fabric** `^5.3.0` - Canvas manipulation
- **html-to-image** `^1.11.13` - HTML to image conversion
- **dompurify** `^3.3.0` - HTML sanitization

### **Image Generation**
- **@fal-ai/client** `^1.7.2` - FAL AI image generation client
- **Nano Image Generation** - AI image generation service

---

## 🤖 AI & Machine Learning

### **AI Providers**
- **Anthropic Claude API** - Primary AI model
  - Model: `claude-sonnet-4-20250514`
  - Content generation
  - Editorial assistance
  - Brand voice enforcement

- **Google Gemini** (via Lovable Gateway)
  - Model: `gemini-2.5-flash`
  - Available but not actively used

- **AI SDK** (`ai` `^5.0.93`) - Vercel AI SDK for streaming

---

## 🔗 External Integrations

### **E-commerce**
- **Shopify API** - Product catalog sync
  - OAuth authentication
  - Product listing generation
  - Product updates

### **Email Marketing**
- **Klaviyo API** - Email marketing platform
  - Campaign creation
  - Audience management
  - List management

### **Social Media**
- **LinkedIn API** - Professional networking
  - OAuth authentication
  - Content publishing
  - Article sharing

- **Etsy API** - Marketplace integration
  - OAuth authentication
  - Listing creation
  - Product sync

### **Calendar**
- **Google Calendar API** - Calendar integration
  - OAuth2 authentication
  - Event synchronization
  - Two-way sync

### **Content Management**
- **Sanity.io** - Headless CMS
  - Content publishing
  - Canvas document sync
  - Portable Text format

### **Payment Processing**
- **Stripe** - Payment processing
  - Checkout sessions
  - Subscription management
  - Webhook handling
  - Customer portal

### **Email Service**
- **Resend** `^6.5.2` - Transactional emails
  - Welcome emails
  - Team invitations
  - Report emails

---

## 🎯 Utility Libraries

### **General Utilities**
- **lodash** `^4.17.21` - Utility functions
- **uuid** `^13.0.0` - UUID generation
- **cmdk** `^1.1.1` - Command palette component

### **Input Components**
- **input-otp** `^1.4.2` - OTP input component
- **react-dropzone** `^14.3.5` - File upload component

### **UI Components**
- **vaul** `^0.9.9` - Drawer component
- **embla-carousel-react** `^8.6.0` - Carousel component
- **sonner** `^1.7.4` - Toast notifications
- **next-themes** `^0.3.0` - Theme management

### **QR Codes**
- **qrcode** `^1.5.4` - QR code generation

### **Syntax Highlighting**
- **react-syntax-highlighter** `^15.6.6` - Code syntax highlighting

---

## 🗂️ File Structure

### **Frontend Structure**
```
src/
├── components/     # React components
├── pages/          # Route pages
├── hooks/          # Custom React hooks
├── lib/            # Utility libraries
├── contexts/       # React contexts
├── types/          # TypeScript types
├── utils/          # Helper functions
├── design/         # Design tokens
└── integrations/   # External service integrations
```

### **Backend Structure**
```
supabase/
├── functions/      # Edge Functions (Deno)
│   ├── _shared/   # Shared utilities
│   └── [function]/ # Individual functions
├── migrations/     # Database migrations
└── types/          # Database types
```

---

## 🔐 Security & Authentication

### **Authentication**
- **Supabase Auth** - Authentication service
  - Email/password
  - OAuth providers
  - Session management
  - JWT tokens

### **Authorization**
- **Row Level Security (RLS)** - Database-level security
- **Organization-scoped access** - Multi-tenant isolation

---

## 📦 Storage

### **File Storage**
- **Supabase Storage** - Object storage
  - Brand documents
  - Brand assets
  - Generated images
  - Worksheet uploads
  - DAM (Digital Asset Management) assets

### **Storage Buckets**
- `brand-documents`
- `brand-assets`
- `madison-training-docs`
- `worksheet-uploads`
- `dam-assets`

---

## 🚀 Deployment & Infrastructure

### **Hosting**
- **Vercel** (likely) - Frontend hosting
- **Supabase** - Backend hosting

### **Environment**
- **Node.js 20.x** - Runtime
- **Deno** - Edge Functions runtime

---

## 📊 Monitoring & Analytics

### **Error Tracking**
- Console logging
- Error boundaries

### **Performance**
- Vite build optimization
- Code splitting
- Lazy loading

---

## 🧪 Testing & Quality

### **Code Quality**
- **ESLint** - Linting
- **TypeScript** - Type checking
- **Prettier** (likely) - Code formatting

---

## 📚 Documentation

### **Documentation Tools**
- Markdown files
- Inline code comments
- TypeScript types as documentation

---

## 🔄 Development Workflow

### **Version Control**
- **Git** - Source control
- **GitHub** - Repository hosting

### **Package Management**
- **npm** / **pnpm** - Package manager

### **Scripts**
- `dev` - Development server
- `build` - Production build
- `build:dev` - Development build
- `lint` - Lint code
- `preview` - Preview build

---

## 🌐 Browser APIs Used

### **Web APIs**
- **Fetch API** - HTTP requests
- **File API** - File handling
- **Clipboard API** - Copy/paste
- **URL API** - URL manipulation
- **Web Storage API** - Local storage
- **Canvas API** - Image manipulation (via Fabric.js)

---

## 📱 Responsive Design

### **Breakpoints**
- Mobile-first approach
- Tailwind responsive utilities
- Custom breakpoints in design tokens

---

## 🎨 Design System

### **Design Tokens**
- Custom design token system
- Brand colors (Ink, Charcoal, Vellum, Parchment, Brass)
- Typography (Cormorant Garamond, Lato, Crimson Text)
- Spacing scale (4px-based)
- Shadow system
- Animation timing

### **Brand Philosophy**
- "Black Books & Cream Paper" aesthetic
- Museum-quality luxury
- Editorial excellence

---

## 🔧 Edge Functions (Supabase)

### **AI & Content Generation**
1. `generate-with-claude` - Primary AI content generation
2. `think-mode-chat` - Advanced AI conversation
3. `generate-image-with-nano` - AI image generation
4. `generate-madison-image` - Madison-specific images
5. `generate-madison-video` - Video generation
6. `repurpose-content` - Content repurposing

### **Brand Intelligence**
7. `process-brand-document` - Extract brand knowledge from PDFs
8. `scan-brand-document` - Document scanning
9. `scrape-brand-website` - Website scraping
10. `scan-website` / `scan-website-enhanced` - Website analysis
11. `extract-brand-knowledge` - Structure brand intelligence
12. `analyze-brand-dna` - Brand DNA analysis
13. `analyze-brand-health` - Brand health analysis
14. `analyze-brand-consistency` - Consistency checking
15. `competitive-intelligence` - Competitive analysis

### **Integrations**
16. `google-calendar-oauth` - Google Calendar OAuth
17. `sync-to-google-calendar` - Calendar sync
18. `connect-shopify` - Shopify OAuth
19. `sync-shopify-products` - Product sync
20. `update-shopify-product` - Product updates
21. `connect-klaviyo` - Klaviyo connection
22. `fetch-klaviyo-lists` - Audience lists
23. `fetch-klaviyo-campaigns` - Campaign data
24. `fetch-klaviyo-segments` - Audience segments
25. `publish-to-klaviyo` - Email publishing
26. `linkedin-oauth-start` / `linkedin-oauth-callback` - LinkedIn OAuth
27. `linkedin-publish` - LinkedIn publishing
28. `etsy-oauth-start` / `etsy-oauth-callback` - Etsy OAuth
29. `etsy-push-listing` - Etsy listing creation
30. `etsy-disconnect` - Etsy disconnection
31. `push-to-sanity` - Sanity.io publishing
32. `canvas-sync` - Sanity Canvas sync

### **Content Processing**
33. `parse-content-worksheet` - Worksheet parsing
34. `process-madison-training-document` - Training doc processing
35. `enhance-copy` - Copy enhancement
36. `analyze-amplify-fit` - Content fit analysis

### **Image Processing**
37. `remove-background` - Background removal
38. `add-text-to-image` - Text overlay
39. `generate-barcode-image` - Barcode generation
40. `process-dam-asset` - DAM asset processing
41. `upload-dam-asset` - DAM asset upload
42. `mark-generated-image-saved` - Image save tracking

### **Product Management**
43. `marketplace-assistant` - Marketplace help
44. `generate-label-text` - Label generation
45. `generate-inci-list` - INCI list generation
46. `detect-allergens` - Allergen detection
47. `generate-sds-document` - SDS document generation

### **Reporting**
48. `generate-report-pdf` - PDF report generation
49. `render-pdf-from-url` - PDF rendering
50. `send-report-email` - Email reports

### **Billing & Payments**
51. `create-checkout-session` - Stripe checkout
52. `create-portal-session` - Customer portal
53. `stripe-webhook` - Payment webhooks
54. `get-subscription` - Subscription info

### **Utilities**
55. `check-auth` - Auth verification
56. `get-business-type-config` - Business config
57. `log-shot-type` - Photography logging
58. `public-blog-feed` - Public blog feed
59. `send-welcome-email` - Welcome emails
60. `send-team-invitation` - Team invitations
61. `suggest-brand-knowledge` - Knowledge suggestions
62. `suggest-scent-notes` - Scent suggestions
63. `refine-prompt-template` - Prompt refinement

---

## 📈 Summary Statistics

### **Total Dependencies**
- **Production:** ~60+ packages
- **Development:** ~10 packages
- **Edge Functions:** 64+ functions

### **External Services**
- **AI:** Anthropic Claude, Google Gemini, FAL AI, Nano
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **Auth:** Supabase Auth
- **Payments:** Stripe
- **Email:** Resend
- **E-commerce:** Shopify, Etsy
- **Marketing:** Klaviyo
- **Social:** LinkedIn
- **Calendar:** Google Calendar
- **CMS:** Sanity.io

### **Lines of Code** (Estimated)
- Frontend: ~50,000+ lines
- Backend (Edge Functions): ~30,000+ lines
- Database migrations: ~5,000+ lines
- Total: ~85,000+ lines

---

## 🎯 Technology Categories

| Category | Technologies |
|----------|-------------|
| **Frontend Framework** | React 18, TypeScript 5 |
| **Build Tool** | Vite 5 |
| **Styling** | Tailwind CSS 3, PostCSS |
| **UI Components** | Radix UI, Shadcn/UI |
| **State Management** | React Query, React Hooks |
| **Routing** | React Router 6 |
| **Database** | PostgreSQL (via Supabase) |
| **Backend** | Supabase Edge Functions (Deno) |
| **AI/ML** | Anthropic Claude, Google Gemini |
| **Image Processing** | Fabric.js, html-to-image |
| **PDF Generation** | React PDF, jsPDF |
| **Rich Text** | Tiptap 3 |
| **Charts** | Recharts |
| **Payments** | Stripe |
| **Email** | Resend |
| **Integrations** | Shopify, Klaviyo, LinkedIn, Etsy, Google Calendar, Sanity |

---

**Last Updated:** December 2024
**Version:** Current production build

