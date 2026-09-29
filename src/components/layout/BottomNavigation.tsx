import { Home, Pencil, Camera, BookOpen, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MOBILE_TAB_ROUTES } from "@/lib/mobileNav";

interface NavItem {
  icon: React.ElementType;
  label: string;
  route: string;
  featured?: boolean;
}

export const BottomNavigation = () => {
  const location = useLocation();

  const navItems: NavItem[] = [
    { icon: Home, label: "Home", route: MOBILE_TAB_ROUTES.home },
    { icon: Pencil, label: "Create", route: MOBILE_TAB_ROUTES.create },
    { icon: Camera, label: "Dark Room", route: MOBILE_TAB_ROUTES.darkRoom, featured: true },
    { icon: BookOpen, label: "Images", route: MOBILE_TAB_ROUTES.images },
    { icon: Settings, label: "Settings", route: MOBILE_TAB_ROUTES.settings },
  ];

  const isActive = (route: string) => {
    if (route === MOBILE_TAB_ROUTES.home) {
      return location.pathname === "/" || location.pathname === "/dashboard";
    }
    return location.pathname === route || location.pathname.startsWith(`${route}/`);
  };

  return (
    <nav
      className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[999] border-t border-brand-stone/40 bg-brand-ink md:hidden safe-area-bottom"
      aria-label="Primary Navigation"
    >
      <div className="flex items-end justify-around px-1 pt-1">
        {navItems.map((item) => {
          const active = isActive(item.route);

          if (item.featured) {
            return (
              <Link
                key={item.route}
                to={item.route}
                className="relative -mt-5 flex min-w-[64px] flex-col items-center justify-center pb-1"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-brass-glow transition-transform duration-150 active:scale-95",
                    active && "ring-2 ring-primary/40 ring-offset-2 ring-offset-brand-ink",
                  )}
                >
                  <item.icon className="h-6 w-6" strokeWidth={1.5} />
                </span>
                <span
                  className={cn(
                    "mt-1 font-sans text-[10px] tracking-wide",
                    active ? "text-primary" : "text-brand-stone",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.route}
              to={item.route}
              className={cn(
                "flex min-h-[56px] min-w-[56px] flex-col items-center justify-center rounded-lg px-2 transition-colors duration-150",
                active
                  ? "text-primary"
                  : "text-brand-stone hover:text-brand-parchment",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="mb-1 h-5 w-5" strokeWidth={1.5} />
              <span className="font-sans text-[10px] tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
