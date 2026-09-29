/**
 * Dev-only layout preview so mobile chrome can be audited without a session.
 * Never enable in production builds.
 */
export function isMobileLayoutPreviewEnabled(): boolean {
  return import.meta.env.DEV === true && import.meta.env.VITE_MOBILE_LAYOUT_PREVIEW === "1";
}
