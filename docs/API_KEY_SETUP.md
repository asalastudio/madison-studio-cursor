# API Key Setup Guide

The `generate-with-claude` edge function requires at least one AI API key to be configured. You can use any of:

1. **Gemini Direct API** (`GEMINI_API_KEY`) - **Recommended** for cost-effectiveness (subscription-based)
2. **Anthropic Claude** (`ANTHROPIC_API_KEY`) - High quality, pay-per-use backup

**Priority Order**: Gemini Direct → Anthropic Claude

## Setting Up API Keys in Supabase

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Click **Add new secret**
4. Add one or more of the following:

   **For Gemini Direct (Recommended):**
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API key from https://aistudio.google.com
   - Click **Save**

   **For Anthropic Claude:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your Anthropic API key from https://console.anthropic.com
   - Click **Save**


### Option 2: Using Supabase CLI

```bash
# Set Gemini Direct API key (recommended - most cost-effective)
supabase secrets set GEMINI_API_KEY="AIzaSy..."

# Or set Anthropic API key
supabase secrets set ANTHROPIC_API_KEY="your-anthropic-api-key-here"

# Or set both (priority: Gemini → Claude)
supabase secrets set GEMINI_API_KEY="AIzaSy..." ANTHROPIC_API_KEY="your-anthropic-key"
```

### For Local Development

If you're running Supabase locally:

1. Copy `.env.example` to `.env` and fill in your values
2. For edge functions, set `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` in your `.env` (Supabase CLI passes these to local functions)
3. Set `ENVIRONMENT=development` in `.env` to see detailed error messages when debugging AI model issues


## Getting Your API Keys

### Gemini Direct API Key (Recommended)
1. Go to https://aistudio.google.com
2. Sign in with your Google account (the one with Gemini Workspace subscription)
3. Click **"Get API Key"** in the left sidebar
4. Create a new API key or select your workspace subscription
5. Copy the API key (starts with `AIza...`)
6. Add it as `GEMINI_API_KEY` in Supabase

**Note**: If you have a Gemini Workspace/Ultra subscription, your API key will automatically use your subscription quota, making it the most cost-effective option.

### Anthropic API Key
1. Go to https://console.anthropic.com
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key
6. Add it as `ANTHROPIC_API_KEY` in Supabase

## Verifying Setup

After setting up the API keys:

1. Try generating content again
2. Check the browser console - you should see logs indicating which API is being used
3. Look for messages like:
   - "Using Gemini Direct API as primary (cost-effective subscription)" ← Best option
   - "Using Anthropic Claude for generation"
4. Check Supabase Edge Function logs to see which API was actually used

## Troubleshooting

- **"No AI API configured"** - Make sure you've set at least one of the API keys in Supabase Edge Function secrets
- **403/401 errors** - Check that your API key is valid and has not expired
- **Rate limit errors** - You may need to upgrade your API plan or wait before trying again


