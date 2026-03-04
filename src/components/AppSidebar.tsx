import { Home, Archive, Pencil, Share2, Calendar, FileText, Video, Settings, ChevronLeft, ChevronRight, LogOut, User, Menu, ShoppingBag, Store, Image, Mail, ChevronDown, Palette, FolderOpen, BookOpen, HelpCircle, Camera, Package, Building2 } from "lucide-react";
import { VaultSidebarBtn } from "@/components/sidebar/VaultSidebarBtn";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsEcommerceOrg } from "@/hooks/useIndustryConfig";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppSidebar() {
  const { open, toggleSidebar, isMobile, openMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { isEcommerce, loading: isEcommerceLoading } = useIsEcommerceOrg();

  // Helper to check if a group contains the active route
  const isGroupActive = (items: { url: string }[]) => {
    return items.some(item => isActive(item.url));
  };

  // Collapsible state for each group (auto-expand if contains active route)
  const [studioOpen, setStudioOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Auto-expand group if it contains the active route
  useEffect(() => {
    const studioItems = [
      { url: "/create" },
      { url: "/multiply" },
      { url: "/darkroom" },
      // { url: "/press" }, // Hidden - keep in code, not pushed live
      // { url: "/video-project" }, // Removed from project
      // { url: "/image-editor" }, // Hidden - use Dark Room instead
      // { url: "/email-builder" }, // Temporarily hidden for launch
    ];
    const libraryItems = [
      { url: "/library" },
      { url: "/image-library" },
    ];
    const productsItems = [
      { url: "/products" },
      { url: "/suppliers" },
    ];
    const marketplaceItems = [
      { url: "/marketplace" },
      { url: "/marketplace-library" },
    ];
    const helpItems = [
      { url: "/meet-madison" },
      { url: "/help-center" },
    ];

    // Use local isGroupActive function for checking active routes
    const checkGroupActive = (items: { url: string }[]) => {
      return items.some(item => {
        if (item.url === "/" && location.pathname === "/") return true;
        if (item.url !== "/" && location.pathname.startsWith(item.url)) return true;
        return false;
      });
    };

    if (checkGroupActive(studioItems)) setStudioOpen(true);
    if (checkGroupActive(libraryItems)) setLibraryOpen(true);
    if (checkGroupActive(productsItems)) setProductsOpen(true);
    if (checkGroupActive(marketplaceItems)) setMarketplaceOpen(true);
    if (checkGroupActive(helpItems)) setHelpOpen(true);
  }, [location.pathname]);

  // Top-level nav items (always visible)
  const topLevelItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "Schedule", url: "/schedule", icon: Calendar },
  ];

  // Grouped navigation structure
  const navGroups = [
    {
      title: "Studio",
      icon: Palette,
      open: studioOpen,
      setOpen: setStudioOpen,
      items: [
        { title: "Create", url: "/create", icon: Pencil },
        { title: "Multiply", url: "/multiply", icon: Share2 },
        { title: "Dark Room", url: "/darkroom", icon: Camera },
        // { title: "The Press", url: "/press", icon: Package }, // Hidden - keep in code, not pushed live
        // { title: "Video Project", url: "/video-project", icon: Video }, // Removed from project
        // { title: "Image Studio", url: "/image-editor", icon: Image }, // Hidden - use Dark Room instead
        // { title: "Email Builder", url: "/email-builder", icon: Mail }, // Temporarily hidden for launch
      ]
    },
    {
      title: "Library",
      icon: FolderOpen,
      open: libraryOpen,
      setOpen: setLibraryOpen,
      items: [
        { title: "The Archives", url: "/library", icon: Archive },
        { title: "Image Library", url: "/image-library", icon: BookOpen },
      ]
    },
    {
      title: "Products",
      icon: Package,
      open: productsOpen,
      setOpen: setProductsOpen,
      items: [
        { title: "Product Hub", url: "/products", icon: Package },
        { title: "Suppliers", url: "/suppliers", icon: Building2 },
      ]
    },
    ...(isEcommerce ? [{
      title: "Marketplace",
      icon: ShoppingBag,
      open: marketplaceOpen,
      setOpen: setMarketplaceOpen,
      items: [
        { title: "Marketplace", url: "/marketplace", icon: Store },
        { title: "Listing Templates", url: "/marketplace-library", icon: FileText },
      ]
    }] : []),
    {
      title: "Help",
      icon: HelpCircle,
      open: helpOpen,
      setOpen: setHelpOpen,
      items: [
        { title: "Meet Madison", url: "/meet-madison", icon: User },
        { title: "Video Tutorials", url: "/help-center", icon: Video },
      ]
    },
  ];

  const handleSignOut = () => {
    // Use the signOut from AuthContext which handles everything properly
    signOut();
  };

  // Get user display info
  const getUserInitials = () => {
    if (!user?.email) return "U";
    return user.email.substring(0, 2).toUpperCase();
  };

  const getUserDisplay = () => {
    if (!user?.email) return "User";
    // Get the part before @ in email
    const emailName = user.email.split("@")[0];
    // Capitalize first letter
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  };

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      {/* Mobile Header - Only visible on mobile */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-gradient-to-r from-ink-black to-charcoal border-b border-aged-brass/20 flex items-center px-4">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu strokeWidth={1} className="w-6 h-6 text-parchment-white" />
          </button>
        </header>
      )}

      <Sidebar
        collapsible="icon"
        className="border-r border-black/50"
        style={{
          backgroundColor: "#0A0A0A"
        }}
      >
        {/* Header */}
        <SidebarHeader className="border-b border-white/10 p-0">
          {open && (
            <div className={`px-4 pt-6 pb-4 ${isMobile ? 'pt-4 pb-3' : ''}`}>
              {/* Different layouts for mobile vs desktop */}
              {isMobile ? (
                // Mobile: Logo left, close button right, with proper spacing
                <div className="flex items-center justify-between w-full">
                  <NavLink to="/dashboard" className="group flex-shrink-0">
                    <span className="font-serif text-lg tracking-[0.18em] text-brand-parchment" style={{ fontWeight: 300 }}>MADISON</span>
                  </NavLink>

                  <button
                    onClick={toggleSidebar}
                    className="relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(38,33%,56%)]/50 rounded-md flex-shrink-0 ml-4"
                    aria-label="Close menu"
                  >
                    <div className="relative w-8 h-8 rounded-md border border-[hsl(38,33%,56%)]/30 bg-white/5 flex items-center justify-center transition-all duration-200 group-hover:border-[hsl(38,33%,56%)] group-hover:bg-white/10">
                      <ChevronLeft className="w-4 h-4 text-[hsl(38,33%,56%)]" />
                    </div>
                  </button>
                </div>
              ) : (
                // Desktop: Close button left, logo right
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleSidebar}
                    className="relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(38,33%,56%)]/50 rounded-md"
                    aria-label="Collapse sidebar"
                  >
                    <div className="relative w-8 h-8 rounded-md border border-[hsl(38,33%,56%)]/30 bg-white/5 flex items-center justify-center transition-all duration-200 group-hover:border-[hsl(38,33%,56%)] group-hover:bg-white/10 group-hover:shadow-[0_0_12px_rgba(184,149,106,0.3)]">
                      <ChevronLeft className="w-4 h-4 text-[hsl(38,33%,56%)] transition-transform duration-200 group-hover:scale-110" />
                    </div>
                  </button>
                  <NavLink to="/dashboard" className="group">
                    <span className="font-serif text-xl tracking-[0.216em] text-brand-parchment" style={{ fontWeight: 300 }}>MADISON</span>
                  </NavLink>
                </div>
              )}
            </div>
          )}



          {!open && (
            <div className="px-2 pt-6 pb-4 flex flex-col items-center gap-3">
              <NavLink to="/dashboard" className="group">
                <span className="font-serif text-sm tracking-wider text-brand-parchment" style={{ fontWeight: 300 }}>M</span>
              </NavLink>
              <button
                onClick={toggleSidebar}
                className="group w-full h-10 rounded-md transition-all duration-200 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(38,33%,56%)]/50 border border-[hsl(38,33%,56%)]/30 bg-white/5 hover:border-[hsl(38,33%,56%)] hover:bg-white/10 hover:shadow-[0_0_12px_rgba(184,149,106,0.3)]"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="w-4 h-4 text-[hsl(38,33%,56%)] transition-transform duration-200 group-hover:scale-110" />
              </button>
            </div>
          )}
        </SidebarHeader>


        {/* Main Navigation */}
        <SidebarContent>
          {/* Top-level items: Dashboard & Schedule */}
          <div className="px-2 pt-4 pb-2 space-y-1">
            <SidebarMenu>
              {topLevelItems.map((item) => {
                const isActiveRoute = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={`
                        group
                        ${isActiveRoute
                          ? 'border-l-2 border-[hsl(38,33%,56%)] bg-white/8 text-white shadow-[inset_4px_0_8px_rgba(184,149,106,0.1)]'
                          : 'text-white/50 hover:text-white/80 hover:bg-white/5 hover:border-l-2 hover:border-[hsl(38,33%,56%)]/40'
                        }
                        ${open ? 'py-2.5 px-3' : 'h-12 justify-center'}
                        transition-all duration-200
                      `}
                    >
                      <NavLink
                        to={item.url}
                        onClick={() => {
                          console.log(`AppSidebar → ${item.title.toLowerCase()} click`);
                          if (isMobile) toggleSidebar();
                        }}
                      >
                        <item.icon
                          strokeWidth={1}
                          className={`w-6 h-6 shrink-0 transition-all duration-200 ${isActiveRoute
                            ? 'text-[hsl(38,33%,56%)] drop-shadow-[0_0_6px_rgba(184,149,106,0.4)]'
                            : 'text-white/50 group-hover:text-white/70 group-hover:drop-shadow-[0_0_4px_rgba(184,149,106,0.2)] group-hover:scale-105'
                            }`}
                        />
                        {open && (
                          <span className="font-semibold text-sm tracking-wide">{item.title}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>

          <Separator className="mx-4 bg-white/10" />

          {/* Collapsible Groups */}
          <div className="px-2 py-4 space-y-2">
            {navGroups.map((group) => {
              const hasActiveChild = group.items.some(item => isActive(item.url));

              return (
                <Collapsible
                  key={group.title}
                  open={group.open}
                  onOpenChange={group.setOpen}
                  className="space-y-1"
                >
                  {/* Group Header */}
                  <CollapsibleTrigger className="w-full">
                    <div className={`
                      flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-200
                      ${hasActiveChild
                        ? 'bg-white/5 text-[hsl(38,33%,56%)]'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                      }
                      ${open ? '' : 'justify-center'}
                    `}>
                      <group.icon
                        strokeWidth={1}
                        className={`w-5 h-5 shrink-0 ${hasActiveChild ? 'text-[hsl(38,33%,56%)]' : ''}`}
                      />
                      {open && (
                        <>
                          <span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider">
                            {group.title}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${group.open ? 'rotate-180' : ''}`}
                          />
                        </>
                      )}
                    </div>
                  </CollapsibleTrigger>

                  {/* Group Items */}
                  <CollapsibleContent className="space-y-1">
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const isActiveRoute = isActive(item.url);
                        return (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              asChild
                              className={`
                                group
                                ${isActiveRoute
                                  ? 'border-l-2 border-[hsl(38,33%,56%)] bg-white/8 text-white shadow-[inset_4px_0_8px_rgba(184,149,106,0.1)]'
                                  : 'text-white/50 hover:text-white/80 hover:bg-white/5 hover:border-l-2 hover:border-[hsl(38,33%,56%)]/40'
                                }
                                ${open ? 'py-2 px-3 ml-4' : 'h-10 justify-center'}
                                transition-all duration-200
                              `}
                            >
                              <NavLink
                                to={item.url}
                                onClick={() => {
                                  console.log(`AppSidebar → ${item.title.toLowerCase()} click`);
                                  if (isMobile) toggleSidebar();
                                }}
                                className="w-full"
                              >
                                {open && (
                                  <span className="text-sm">{item.title}</span>
                                )}
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>

          {/* The Vault - Premium DAM Access */}
          <div className="px-2 pb-4 mt-auto">
            <VaultSidebarBtn
              isActive={isActive("/dam")}
              onNavigate={() => {
                if (isMobile) toggleSidebar();
              }}
            />
          </div>
        </SidebarContent>

        {/* Footer - User Account Section */}
        <SidebarFooter className="border-t border-white/5 p-4">
          <TooltipProvider>
            {/* Account Label - Clear indicator this is their profile */}
            {open && (
              <div className="mb-3">
                <span className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">
                  Your Account
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-10 h-10 bg-aged-brass rounded-full flex items-center justify-center text-ink-black font-bold text-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-[hsl(38,33%,56%)]/50 transition-all duration-200">
                    {getUserInitials()}
                  </div>
                </TooltipTrigger>
                {!open && (
                  <TooltipContent side="right">
                    <p className="font-medium">{getUserDisplay()}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </TooltipContent>
                )}
              </Tooltip>
              {open && (
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{getUserDisplay()}</p>
                  <p className="text-white/60 text-xs truncate">{user?.email}</p>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate('/settings')}
                    className="group text-white/50 hover:text-[hsl(38,33%,56%)] p-2 rounded-lg hover:bg-white/5 transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(184,149,106,0.3)]"
                    aria-label="Settings"
                  >
                    <Settings strokeWidth={1} className="w-5 h-5 transition-all duration-200 group-hover:scale-105" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Settings</p>
                </TooltipContent>
              </Tooltip>
              {open && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleSignOut}
                      className="group text-white/50 hover:text-red-400 p-2 rounded-lg hover:bg-white/5 transition-all duration-200"
                      aria-label="Sign Out"
                    >
                      <LogOut strokeWidth={1} className="w-5 h-5 transition-all duration-200 group-hover:scale-105" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Sign Out</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
