/**
 * Shared mobile navigation metadata.
 * Keep destinations here so the bottom tab bar, header titles, and layout
 * tests stay in lockstep without touching page business logic.
 */

export const MOBILE_TAB_ROUTES = {
  home: "/dashboard",
  create: "/create",
  darkRoom: "/darkroom",
  images: "/image-library",
  settings: "/settings",
} as const;

export const MOBILE_PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/create": "Create",
  "/multiply": "Multiply",
  "/library": "Archives",
  "/image-library": "Image Library",
  "/darkroom": "Dark Room",
  "/light-table": "Light Table",
  "/settings": "Settings",
  "/schedule": "Schedule",
  "/calendar": "Schedule",
  "/products": "Products",
  "/suppliers": "Suppliers",
  "/dam": "The Vault",
  "/help-center": "Help",
  "/meet-madison": "Meet Madison",
  "/brand-health": "Brand Health",
  "/brand-builder": "Brand Builder",
  "/onboarding": "Set up your brand",
  "/auth": "Sign in",
};

export function getMobilePageTitle(pathname: string): string {
  if (MOBILE_PAGE_TITLES[pathname]) {
    return MOBILE_PAGE_TITLES[pathname];
  }

  const match = Object.keys(MOBILE_PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((path) => path !== "/" && pathname.startsWith(path));

  return match ? MOBILE_PAGE_TITLES[match] : "Madison";
}

export function isMobileTabRoute(pathname: string): boolean {
  return Object.values(MOBILE_TAB_ROUTES).some((route) => {
    if (route === "/dashboard") {
      return pathname === "/" || pathname === "/dashboard";
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}
