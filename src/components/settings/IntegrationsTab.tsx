import { useState, useEffect } from "react";
import { ShopifyConnection } from "./ShopifyConnection";
import { KlaviyoConnection } from "./KlaviyoConnection";
import { EtsyConnection } from "./EtsyConnection";
import { LinkedInConnection } from "./LinkedInConnection";
import { SocialConnections } from "./SocialConnections";
import { SanityConnection } from "./SanityConnection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Bot, Plus, Trash2, Sparkles, Store, Linkedin, Database, Share2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompetitiveIntelligence } from "@/hooks/useCompetitiveIntelligence";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export function IntegrationsTab() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [newCompetitorUrl, setNewCompetitorUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadOrganization();
  }, []);

  const loadOrganization = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership) {
      setOrganizationId(membership.organization_id);
    }
  };

  const {
    preferences,
    competitors,
    loading,
    toggleCompetitiveIntelligence,
    addCompetitor,
    removeCompetitor,
    refreshData
  } = useCompetitiveIntelligence(organizationId);

  const handleAddCompetitor = () => {
    if (newCompetitorName && newCompetitorUrl) {
      addCompetitor(newCompetitorName, newCompetitorUrl);
      setNewCompetitorName("");
      setNewCompetitorUrl("");
    }
  };

  const handleScanNow = async () => {
    if (!organizationId) return;

    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('competitive-intelligence', {
        body: { organizationId }
      });

      if (error) throw error;

      toast({
        title: "Scan Complete",
        description: `Analysis complete. Check the Dashboard for new insights.`,
      });

      refreshData();
    } catch (error: any) {
      console.error('Error scanning competitors:', error);
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan competitors. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-serif mb-2">Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connect external platforms and enable AI agents
        </p>
      </div>


      {/* E-commerce Platforms */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <CardTitle>Shopify</CardTitle>
              <CardDescription>
                Sync your product catalog and publish luxury descriptions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ShopifyConnection />
        </CardContent>
      </Card>

      {/* Etsy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Store className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <CardTitle>Etsy</CardTitle>
              <CardDescription>
                Push marketplace listings directly to your Etsy shop as drafts
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <EtsyConnection organizationId={organizationId} />
        </CardContent>
      </Card>

      {/* Email Marketing - Klaviyo */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <CardTitle>Klaviyo</CardTitle>
              <CardDescription>
                Connect your email marketing platform to publish campaigns
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <KlaviyoConnection />
        </CardContent>
      </Card>

      {/* Social publishing */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-pink-500" />
            </div>
            <div>
              <CardTitle>Social publishing</CardTitle>
              <CardDescription>
                Connect Instagram, LinkedIn, Pinterest, Facebook and TikTok, then publish or
                schedule from the calendar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SocialConnections />
        </CardContent>
      </Card>

      {/* LinkedIn */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0077B5]/10 flex items-center justify-center">
              <Linkedin className="w-5 h-5 text-[#0077B5]" />
            </div>
            <div>
              <CardTitle>LinkedIn</CardTitle>
              <CardDescription>
                Publish content directly to your LinkedIn profile or company page
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LinkedInConnection organizationId={organizationId} />
        </CardContent>
      </Card>

      {/* Sanity.io CMS */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <CardTitle>Sanity.io</CardTitle>
              <CardDescription>
                Import fragrance products from your Sanity CMS into Madison
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SanityConnection organizationId={organizationId} />
        </CardContent>
      </Card>

      {/* Competitive Intelligence Agent */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <CardTitle>Competitive Intelligence Agent</CardTitle>
                <CardDescription>
                  AI agent that monitors competitors and identifies trends
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <Switch
                  checked={preferences?.competitive_intelligence_enabled || false}
                  onCheckedChange={toggleCompetitiveIntelligence}
                />
              )}
            </div>
          </div>
        </CardHeader>

        {preferences?.competitive_intelligence_enabled && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="competitor-name">Competitor Name</Label>
                <Input
                  id="competitor-name"
                  placeholder="Competitor Brand Name"
                  value={newCompetitorName}
                  onChange={(e) => setNewCompetitorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitor-url">Competitor Website</Label>
                <Input
                  id="competitor-url"
                  type="url"
                  placeholder="https://competitor.com"
                  value={newCompetitorUrl}
                  onChange={(e) => setNewCompetitorUrl(e.target.value)}
                />
              </div>
              <Button onClick={handleAddCompetitor} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Competitor to Watchlist
              </Button>
            </div>

            {competitors.length > 0 && (
              <>
                <Button
                  onClick={handleScanNow}
                  disabled={isScanning}
                  variant="outline"
                  className="w-full"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isScanning ? "Analyzing Competitors..." : "Scan Competitors Now"}
                </Button>
              </>
            )}

            {competitors.length > 0 && (
              <div className="space-y-2">
                <Label>Monitoring ({competitors.length})</Label>
                <div className="space-y-2">
                  {competitors.map((competitor) => (
                    <div
                      key={competitor.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{competitor.competitor_name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {competitor.competitor_url}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCompetitor(competitor.id!)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Future integrations */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="text-muted-foreground">More Integrations Coming Soon</CardTitle>
          <CardDescription>
            Additional e-commerce platforms and marketing tools will be available in future updates
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
