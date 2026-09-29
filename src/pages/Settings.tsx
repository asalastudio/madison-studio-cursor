import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Bell, CreditCard, Sparkles, Target, Plug, Briefcase } from "lucide-react";
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
import { cn } from "@/lib/utils";

const SETTINGS_SECTIONS = [
  { value: "brand", label: "Brand", icon: Building2 },
  { value: "business-type", label: "Business", icon: Briefcase },
  { value: "madison", label: "Madison", icon: Sparkles },
  { value: "goals", label: "Goals", icon: Target },
  { value: "team", label: "Team", icon: Users },
  { value: "notifications", label: "Alerts", icon: Bell },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "integrations", label: "Apps", icon: Plug },
] as const;

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "brand";
  const { user } = useAuth();
  const [organizationName, setOrganizationName] = useState<string>("");

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

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
              setOrganizationName((org as { name?: string }).name || "");
            }
          }
        });
    }
  }, [user]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="mx-auto max-w-6xl">
        <div className="border-b border-border bg-card px-4 py-4 md:px-8 md:py-6">
          <h1 className="font-serif text-2xl text-foreground md:text-4xl">
            Settings{organizationName && ` • ${organizationName}`}
          </h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground md:mt-2 md:text-base">
            Configure your brand, products, and preferences
          </p>
        </div>

        <div className="px-4 py-4 md:px-8 md:py-6">
          <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 gap-2 md:hidden">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = currentTab === section.value;
                return (
                  <button
                    key={section.value}
                    type="button"
                    onClick={() => handleTabChange(section.value)}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-3 text-left font-sans text-sm transition-colors duration-150",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <TabsList className="flex w-full flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
                {SETTINGS_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <TabsTrigger
                      key={section.value}
                      value={section.value}
                      className="gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{section.label}</span>
                    </TabsTrigger>
                  );
                })}
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
          </Tabs>
        </div>
      </div>
    </div>
  );
}
