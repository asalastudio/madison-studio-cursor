import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Bell, CreditCard, Sparkles, Target, Plug, Briefcase, LayoutDashboard } from "lucide-react";
import { ProjectsTab } from "@/components/settings/ProjectsTab";
import { useMadisonCanvasFeatureFlag } from "@/hooks/useMadisonCanvasFeatureFlag";
import { BrandGuidelinesTab } from "@/components/settings/BrandGuidelinesTab";
import { TeamTab } from "@/components/settings/TeamTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { BillingTab } from "@/components/settings/BillingTab";
import { MadisonTrainingTab } from "@/components/settings/MadisonTrainingTab";
import { GoalsTab } from "@/components/settings/GoalsTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { BusinessTypeTab } from "@/components/settings/BusinessTypeTab";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'brand';
  const { user } = useAuth();
  const [organizationName, setOrganizationName] = useState<string>("");
  const { enabled: canvasEnabled } = useMadisonCanvasFeatureFlag();

  // Handle tab change - update URL
  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  // Fetch organization name
  useEffect(() => {
    if (user) {
      supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(async ({ data }) => {
          if (data?.organization_id) {
            const { data: org } = await supabase
              .from("organizations")
              .select("name")
              .eq("id", data.organization_id)
              .maybeSingle();
            if (org?.name) {
              setOrganizationName((org as any).name);
            }
          }
        });
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-6xl mx-auto">
        {/* Page Header - Mobile Optimized */}
        <div className="px-4 md:px-8 py-4 md:py-6 border-b border-[#E0E0E0] bg-white">
          <h1 className="text-2xl md:text-4xl font-serif text-[#1C150D]">
            Settings{organizationName && ` • ${organizationName}`}
          </h1>
          <p className="text-sm md:text-base text-[#1C150D]/60 mt-1 md:mt-2">
            Configure your brand, products, and preferences
          </p>
        </div>

        {/* Tabs Section - Mobile Optimized */}
        <div className="px-4 md:px-8 py-4 md:py-6">
          <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-4 md:space-y-6">
            {/* Mobile: Scrollable horizontal tabs */}
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              <TabsList className="bg-white border border-[#E0E0E0] p-1 flex md:flex-wrap gap-1 min-w-max md:w-full rounded-lg">
                <TabsTrigger
                  value="brand"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Building2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Brand</span>
                </TabsTrigger>
                <TabsTrigger
                  value="business-type"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Briefcase className="w-4 h-4" />
                  <span className="hidden sm:inline">Business</span>
                </TabsTrigger>
                <TabsTrigger
                  value="madison"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Madison</span>
                </TabsTrigger>
                <TabsTrigger
                  value="goals"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Target className="w-4 h-4" />
                  <span className="hidden sm:inline">Goals</span>
                </TabsTrigger>
                <TabsTrigger
                  value="team"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Team</span>
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Bell className="w-4 h-4" />
                  <span className="hidden sm:inline">Alerts</span>
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="hidden sm:inline">Billing</span>
                </TabsTrigger>
                <TabsTrigger
                  value="integrations"
                  className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                >
                  <Plug className="w-4 h-4" />
                  <span className="hidden sm:inline">Apps</span>
                </TabsTrigger>
                {canvasEnabled && (
                  <TabsTrigger
                    value="projects"
                    className="data-[state=active]:bg-brand-brass data-[state=active]:text-white px-3 py-2 gap-2 whitespace-nowrap rounded-md transition-colors text-sm"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="hidden sm:inline">Projects</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="brand" className="space-y-6">
              <BrandGuidelinesTab />
            </TabsContent>

            <TabsContent value="business-type" className="space-y-6">
              <BusinessTypeTab />
            </TabsContent>

            <TabsContent value="madison">
              <MadisonTrainingTab />
            </TabsContent>

            <TabsContent value="goals">
              <GoalsTab />
            </TabsContent>

            <TabsContent value="team">
              <TeamTab />
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationsTab />
            </TabsContent>

            <TabsContent value="billing">
              <BillingTab />
            </TabsContent>

            <TabsContent value="integrations">
              <IntegrationsTab />
            </TabsContent>

            {canvasEnabled && (
              <TabsContent value="projects" className="space-y-6">
                <ProjectsTab />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
