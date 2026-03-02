-- Add IV (initialization vector) columns for AES-GCM encryption
-- Required for the security remediation: replacing base64/XOR with proper AES-GCM encryption

-- Etsy connections: add IV columns for access and refresh tokens
ALTER TABLE IF EXISTS etsy_connections
  ADD COLUMN IF NOT EXISTS access_token_iv text,
  ADD COLUMN IF NOT EXISTS refresh_token_iv text;

-- Klaviyo connections: add IV column for API key
ALTER TABLE IF EXISTS klaviyo_connections
  ADD COLUMN IF NOT EXISTS api_key_iv text;

-- LinkedIn connections: add IV columns for access and refresh tokens
ALTER TABLE IF EXISTS linkedin_connections
  ADD COLUMN IF NOT EXISTS access_token_iv text,
  ADD COLUMN IF NOT EXISTS refresh_token_iv text;

-- Add comments for clarity
COMMENT ON COLUMN etsy_connections.access_token_iv IS 'AES-GCM initialization vector for access token (base64)';
COMMENT ON COLUMN etsy_connections.refresh_token_iv IS 'AES-GCM initialization vector for refresh token (base64)';
COMMENT ON COLUMN klaviyo_connections.api_key_iv IS 'AES-GCM initialization vector for API key (base64)';
