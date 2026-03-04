import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardWidgetProvider } from "@/contexts/DashboardWidgetContext";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, Suspense, lazy, useRef } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Loader2 } from "lucide-react";

import Navigation from "./components/Navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";

// Critical path - keep as static imports for fast initial load
import Index from "./pages/Index";
import DashboardNew from "./pages/DashboardNew";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

// Lazy-loaded pages - split into separate chunks
const Library = lazy(() => import("./pages/Library"));
const Create = lazy(() => import("./pages/Create"));
const ContentEditor = lazy(() => import("./pages/ContentEditor"));
const Repurpose = lazy(() => import("./pages/Repurpose"));
const Multiply = lazy(() => import("./pages/Multiply"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Settings = lazy(() => import("./pages/Settings"));
const MeetMadison = lazy(() => import("./pages/MeetMadison"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const ThinkMode = lazy(() => import("./pages/ThinkMode"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceLibrary = lazy(() => import("./pages/MarketplaceLibrary"));
const CreateEtsyListing = lazy(() => import("./pages/marketplace/CreateEtsyListing"));
const CreateTikTokShopListing = lazy(() => import("./pages/marketplace/CreateTikTokShopListing"));
const CreateShopifyListing = lazy(() => import("./pages/marketplace/CreateShopifyListing"));
const BrandHealth = lazy(() => import("./pages/BrandHealth"));
const BrandBuilder = lazy(() => import("./pages/BrandBuilder"));
const ImageEditor = lazy(() => import("./pages/ImageEditor"));
const DarkRoom = lazy(() => import("./pages/DarkRoom"));
const LightTable = lazy(() => import("./pages/LightTable"));
// const VideoProject = lazy(() => import("./pages/VideoProject")); // Removed from project
const ImageLibrary = lazy(() => import("./pages/ImageLibrary"));
const EmailBuilderV2 = lazy(() => import("./pages/EmailBuilderV2"));
const ComponentDemo = lazy(() => import("./pages/ComponentDemo"));
const MadisonTest = lazy(() => import("./pages/MadisonTest"));
const BrandReport = lazy(() => import("./pages/BrandReport"));
const WidgetDashboard = lazy(() => import("./pages/WidgetDashboard"));
const DAMLibrary = lazy(() => import("./pages/DAMLibrary"));
const Products = lazy(() => import("./pages/Products"));
const ProductHub = lazy(() => import("./pages/ProductHub"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
// const Press = lazy(() => import("./pages/Press")); // Hidden - keep in code, not pushed live

import { ErrorBoundary } from "./components/ErrorBoundary";
import { useOnboarding } from "@/hooks/useOnboarding";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EcommerceGuard } from "./components/guards/EcommerceGuard";
import { OnboardingTooltipProvider } from "./components/onboarding/OnboardingTooltipProvider";
import { AgentContextProvider } from "./components/agent";

// Loading fallback for lazy routes
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
    <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
  </div>
);

const queryClient = new QueryClient();

const RouteErrorBoundary = ({ children, routeName }: { children: React.ReactNode; routeName: string }) => {
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold">Error in {routeName}</h2>
          <p className="text-muted-foreground">Something went wrong on this page.</p>
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()}>Reload Page</Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [verifying, setVerifying] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChecked = useRef(false);

  useEffect(() => {
    logger.debug("[RouteGuard] ProtectedRoute check", { path: location.pathname, loading, hasUser: !!user });

    if (loading) return; // wait for initial auth hook

    if (user) {
      setAllowed(true);
      setError(null);
      hasChecked.current = true;
      return;
    }

    // Prevent multiple checks/redirects
    if (hasChecked.current || verifying) return;

    // Extra safety: double-check session before redirecting to /auth
    setVerifying(true);
    setError(null);
    hasChecked.current = true;

    supabase.auth.getSession()
      .then(({ data: { session }, error: sessionError }) => {
        logger.debug("[RouteGuard] getSession (guard)", { path: location.pathname, hasUser: !!session?.user });
        if (sessionError) {
          logger.error("[RouteGuard] Session check error", sessionError);
          setError(sessionError.message);
        }
        if (session?.user) {
          setAllowed(true);
        } else {
          logger.warn("[RouteGuard] Redirect → /auth (reason: no authenticated user)", { path: location.pathname });
          navigate("/auth", { replace: true });
        }
      })
      .catch((err) => {
        logger.error("[RouteGuard] Unexpected error in getSession", err);
        setError(err.message || "Authentication check failed");
        // On error, redirect to auth page
        navigate("/auth", { replace: true });
      })
      .finally(() => setVerifying(false));
  }, [loading, user, navigate, location.pathname, verifying]);

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-lg font-serif">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-serif text-foreground mb-4">Authentication Error</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => navigate("/auth", { replace: true })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return allowed ? <>{children}</> : (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground text-lg font-serif">Redirecting…</div>
    </div>
  );
};

const RootRoute = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [redirectCount, setRedirectCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Redirect loop protection
    if (redirectCount >= 3) {
      logger.error("[RootRoute] Redirect loop detected - stopping after", redirectCount, "attempts");
      navigate("/dashboard", { replace: true });
      return;
    }

    if (!user || isChecking) return;
    setIsChecking(true);

    // Safety timeout so we never hang on "Loading…"
    const safetyTimer = setTimeout(() => {
      logger.warn("[RootRoute] Safety timeout reached. Proceeding to dashboard.");
      setIsChecking(false);
    }, 3500);

    const checkOnboardingStatus = async () => {
      try {
        logger.debug("[RootRoute] Checking onboarding status…");
        // Check database for organization with brand_config
        const { data: orgMember, error: memberErr } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (memberErr) {
          logger.warn("[RootRoute] organization_members lookup error", memberErr);
          // On error, redirect to onboarding to be safe
          logger.warn("[RootRoute] Redirect → /onboarding (error fallback)");
          setRedirectCount(prev => prev + 1);
          navigate('/onboarding', { replace: true });
          setIsChecking(false);
          clearTimeout(safetyTimer);
          return;
        }

        if (!orgMember?.organization_id) {
          logger.warn("[RootRoute] Redirect → /onboarding (reason: no organization membership)");
          setRedirectCount(prev => prev + 1);
          navigate('/onboarding', { replace: true });
          setIsChecking(false);
          clearTimeout(safetyTimer);
          return;
        }

        const { data: org, error: orgErr } = await supabase
          .from("organizations")
          .select("brand_config")
          .eq("id", orgMember.organization_id)
          .maybeSingle();

        if (orgErr) {
          logger.warn("[RootRoute] organizations lookup error", orgErr);
          // On error, redirect to onboarding to be safe
          logger.warn("[RootRoute] Redirect → /onboarding (error fallback)");
          setRedirectCount(prev => prev + 1);
          navigate('/onboarding', { replace: true });
          setIsChecking(false);
          clearTimeout(safetyTimer);
          return;
        }

        // If organization has brand info OR user has completed onboarding before, consider it complete
        const hasBrandInfo = org?.brand_config &&
          typeof org.brand_config === 'object' &&
          Object.keys(org.brand_config).length > 0 &&
          ('industry' in org.brand_config || 'brandName' in org.brand_config);

        // Also check localStorage as a fallback
        const hasCompletedBefore = localStorage.getItem(`onboarding_completed_${user.id}`) === "true";

        if (!hasBrandInfo && !hasCompletedBefore) {
          logger.warn("[RootRoute] Redirect → /onboarding (reason: missing brand_config and no completion flag)");
          setRedirectCount(prev => prev + 1);
          navigate('/onboarding', { replace: true });
        } else {
          logger.debug("[RootRoute] Onboarding OK (has brand info or completed before). Staying on dashboard.");
          localStorage.setItem(`onboarding_completed_${user.id}`, "true");
        }

        setIsChecking(false);
        clearTimeout(safetyTimer);
      } catch (error) {
        logger.error("[RootRoute] Unexpected error in checkOnboardingStatus", error);
        // On any unexpected error, redirect to onboarding
        setRedirectCount(prev => prev + 1);
        navigate('/onboarding', { replace: true });
        setIsChecking(false);
        clearTimeout(safetyTimer);
      }
    };

    checkOnboardingStatus();

    return () => clearTimeout(safetyTimer);
  }, [user, navigate, redirectCount]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-lg font-serif">Loading…</div>
      </div>
    );
  }

  if (redirectCount >= 3) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-serif text-foreground mb-4">Navigation Issue Detected</h2>
          <p className="text-muted-foreground mb-6">
            We detected a potential redirect loop. Please try refreshing the page or contact support if the issue persists.
          </p>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/';
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Reset and Restart
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardWidgetProvider>
      <DashboardNew />
    </DashboardWidgetProvider>
  );
};

const AppContent = () => {
  logger.debug("[App-Con]");
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize onboarding for org creation only (no modals shown globally)
  useOnboarding();

  // Show sidebar for authenticated users on all pages except /auth, /editor, /onboarding, and /darkroom
  const showSidebar = user && location.pathname !== "/auth" && location.pathname !== "/editor" && location.pathname !== "/onboarding" && location.pathname !== "/darkroom" && location.pathname !== "/light-table";

  return (
    <>
      {showSidebar ? (
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <main className="flex-1 overflow-auto pt-0">
              <div className="pt-16 md:pt-0">
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                    <Route path="/" element={<ProtectedRoute><RouteErrorBoundary routeName="Dashboard"><RootRoute /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><RouteErrorBoundary routeName="Dashboard"><DashboardWidgetProvider><DashboardNew /></DashboardWidgetProvider></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/dashboard-custom" element={<ProtectedRoute><RouteErrorBoundary routeName="Widget Dashboard"><WidgetDashboard /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/library" element={<ProtectedRoute><RouteErrorBoundary routeName="Library"><Library /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/create" element={<ProtectedRoute><RouteErrorBoundary routeName="Create"><Create /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/editor" element={<ProtectedRoute><RouteErrorBoundary routeName="Editor"><ContentEditor /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/multiply" element={<ProtectedRoute><RouteErrorBoundary routeName="Multiply"><Multiply /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/marketplace" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Marketplace"><Marketplace /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                    <Route path="/marketplace-library" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Listing Templates"><MarketplaceLibrary /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                    <Route path="/marketplace/etsy" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Create Etsy Listing"><CreateEtsyListing /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                    <Route path="/marketplace/tiktok_shop" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Create TikTok Shop Listing"><CreateTikTokShopListing /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                    <Route path="/marketplace/shopify" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Create Shopify Listing"><CreateShopifyListing /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                    <Route path="/image-editor" element={<ProtectedRoute><RouteErrorBoundary routeName="Image Editor"><ImageEditor /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/darkroom" element={<ProtectedRoute><RouteErrorBoundary routeName="Dark Room"><DarkRoom /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/light-table" element={<ProtectedRoute><RouteErrorBoundary routeName="Light Table"><LightTable /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/image-library" element={<ProtectedRoute><RouteErrorBoundary routeName="Image Library"><ImageLibrary /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/dam" element={<ProtectedRoute><RouteErrorBoundary routeName="Asset Library"><DAMLibrary /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/products" element={<ProtectedRoute><RouteErrorBoundary routeName="Products"><Products /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/products/:productId" element={<ProtectedRoute><RouteErrorBoundary routeName="Product Hub"><ProductHub /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/products/:productId/edit" element={<ProtectedRoute><RouteErrorBoundary routeName="Edit Product"><ProductHub /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/suppliers" element={<ProtectedRoute><RouteErrorBoundary routeName="Suppliers"><Suppliers /></RouteErrorBoundary></ProtectedRoute>} />
                    {/* <Route path="/press" element={<ProtectedRoute><RouteErrorBoundary routeName="Press"><Press /></RouteErrorBoundary></ProtectedRoute>} /> */}
                    <Route path="/schedule" element={<ProtectedRoute><RouteErrorBoundary routeName="Calendar"><Calendar /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><RouteErrorBoundary routeName="Calendar"><Calendar /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><RouteErrorBoundary routeName="Settings"><Settings /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/meet-madison" element={<ProtectedRoute><RouteErrorBoundary routeName="Meet Madison"><MeetMadison /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/help-center" element={<ProtectedRoute><RouteErrorBoundary routeName="Help Center"><HelpCenter /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/think-mode" element={<ProtectedRoute><RouteErrorBoundary routeName="Think Mode"><ThinkMode /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/brand-health" element={<ProtectedRoute><RouteErrorBoundary routeName="Brand Health"><BrandHealth /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/brand-builder" element={<ProtectedRoute><RouteErrorBoundary routeName="Brand Builder"><BrandBuilder /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/reports/:domainId" element={<ProtectedRoute><RouteErrorBoundary routeName="Brand Report"><BrandReport /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/component-demo" element={<ProtectedRoute><RouteErrorBoundary routeName="Component Demo"><ComponentDemo /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="/madison-test" element={<ProtectedRoute><RouteErrorBoundary routeName="Madison Test"><MadisonTest /></RouteErrorBoundary></ProtectedRoute>} />
                    {/* Email Builder routes - Temporarily hidden for launch */}
                    {/* <Route path="/email-builder" element={<ProtectedRoute><RouteErrorBoundary routeName="Email Builder"><EmailBuilderV2 /></RouteErrorBoundary></ProtectedRoute>} /> */}
                    {/* Legacy redirects */}
                    {/* <Route path="/email-composer" element={<Navigate to="/email-builder" replace />} /> */}
                    {/* <Route path="/email-builder-v2" element={<Navigate to="/email-builder" replace />} /> */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
              </Suspense>
              </div>
            </main>
          </div>
        </SidebarProvider>
      ) : (
        <>
          <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<ProtectedRoute><RouteErrorBoundary routeName="Onboarding"><Onboarding /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/" element={<Index />} />
                <Route path="/dashboard" element={<ProtectedRoute><RouteErrorBoundary routeName="Dashboard"><DashboardWidgetProvider><DashboardNew /></DashboardWidgetProvider></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/dashboard-custom" element={<ProtectedRoute><RouteErrorBoundary routeName="Widget Dashboard"><WidgetDashboard /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/library" element={<ProtectedRoute><RouteErrorBoundary routeName="Library"><Library /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/create" element={<ProtectedRoute><RouteErrorBoundary routeName="Create"><Create /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/editor" element={<ProtectedRoute><RouteErrorBoundary routeName="Editor"><ContentEditor /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/multiply" element={<ProtectedRoute><RouteErrorBoundary routeName="Multiply"><Multiply /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/marketplace" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Marketplace"><Marketplace /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                <Route path="/marketplace-library" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Listing Templates"><MarketplaceLibrary /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                <Route path="/marketplace/etsy" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Create Etsy Listing"><CreateEtsyListing /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                <Route path="/marketplace/tiktok_shop" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Create TikTok Shop Listing"><CreateTikTokShopListing /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                <Route path="/marketplace/shopify" element={<ProtectedRoute><EcommerceGuard><RouteErrorBoundary routeName="Create Shopify Listing"><CreateShopifyListing /></RouteErrorBoundary></EcommerceGuard></ProtectedRoute>} />
                <Route path="/image-editor" element={<ProtectedRoute><RouteErrorBoundary routeName="Image Editor"><ImageEditor /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/darkroom" element={<ProtectedRoute><RouteErrorBoundary routeName="Dark Room"><DarkRoom /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/light-table" element={<ProtectedRoute><RouteErrorBoundary routeName="Light Table"><LightTable /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/image-library" element={<ProtectedRoute><RouteErrorBoundary routeName="Image Library"><ImageLibrary /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/dam" element={<ProtectedRoute><RouteErrorBoundary routeName="Asset Library"><DAMLibrary /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/products" element={<ProtectedRoute><RouteErrorBoundary routeName="Products"><Products /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/products/:productId" element={<ProtectedRoute><RouteErrorBoundary routeName="Product Hub"><ProductHub /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/products/:productId/edit" element={<ProtectedRoute><RouteErrorBoundary routeName="Edit Product"><ProductHub /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/suppliers" element={<ProtectedRoute><RouteErrorBoundary routeName="Suppliers"><Suppliers /></RouteErrorBoundary></ProtectedRoute>} />
                {/* <Route path="/press" element={<ProtectedRoute><RouteErrorBoundary routeName="Press"><Press /></RouteErrorBoundary></ProtectedRoute>} /> */}
                <Route path="/schedule" element={<ProtectedRoute><RouteErrorBoundary routeName="Calendar"><Calendar /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute><RouteErrorBoundary routeName="Calendar"><Calendar /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><RouteErrorBoundary routeName="Settings"><Settings /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/meet-madison" element={<ProtectedRoute><RouteErrorBoundary routeName="Meet Madison"><MeetMadison /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/help-center" element={<ProtectedRoute><RouteErrorBoundary routeName="Help Center"><HelpCenter /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/think-mode" element={<ProtectedRoute><RouteErrorBoundary routeName="Think Mode"><ThinkMode /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/brand-health" element={<ProtectedRoute><RouteErrorBoundary routeName="Brand Health"><BrandHealth /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/brand-builder" element={<ProtectedRoute><RouteErrorBoundary routeName="Brand Builder"><BrandBuilder /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/reports/:domainId" element={<ProtectedRoute><RouteErrorBoundary routeName="Brand Report"><BrandReport /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/component-demo" element={<ProtectedRoute><RouteErrorBoundary routeName="Component Demo"><ComponentDemo /></RouteErrorBoundary></ProtectedRoute>} />
                <Route path="/madison-test" element={<ProtectedRoute><RouteErrorBoundary routeName="Madison Test"><MadisonTest /></RouteErrorBoundary></ProtectedRoute>} />
                {/* Email Builder routes - Temporarily hidden for launch */}
                {/* <Route path="/email-builder" element={<ProtectedRoute><RouteErrorBoundary routeName="Email Builder"><EmailBuilderV2 /></RouteErrorBoundary></ProtectedRoute>} /> */}
                {/* Legacy redirects */}
                {/* <Route path="/email-composer" element={<Navigate to="/email-builder" replace />} /> */}
                {/* <Route path="/email-builder-v2" element={<Navigate to="/email-builder" replace />} /> */}
                <Route path="*" element={<NotFound />} />
              </Routes>
          </Suspense>
        </>
      )}

      {/* Onboarding Tooltips - Show for authenticated users */}
      {user && <OnboardingTooltipProvider />}

      {/* Madison Agent - Proactive suggestions for authenticated users */}
      {user && <AgentContextProvider enabled={true} idleThresholdMinutes={10} />}
    </>
  );
};

const App = () => {
  logger.debug("[App] App component rendering...");

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrganizationProvider>
          <TooltipProvider>
            <Toaster />
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </OrganizationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
