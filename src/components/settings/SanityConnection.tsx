/**
 * SanityConnection - Sanity.io Integration Settings Component
 *
 * Allows users to sync products from Sanity.io into Madison Studio.
 */

import { useState } from "react";
import { Loader2, RefreshCw, CheckCircle, Database, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SanityConnectionProps {
  organizationId: string | null;
}

export function SanityConnection({ organizationId }: SanityConnectionProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [dataset, setDataset] = useState("production");
  const [lastSync, setLastSync] = useState<string | null>(null);

  const handleSyncProducts = async () => {
    if (!organizationId) {
      toast({
        title: "Error",
        description: "Organization not found",
        variant: "destructive",
      });
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-sanity-products", {
        body: {
          organization_id: organizationId,
          sanity_project_id: projectId,
          sanity_dataset: dataset,
        },
      });

      console.log("[SanityConnection] Full response data:", JSON.stringify(data, null, 2));
      console.log("[SanityConnection] Error:", error);

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "Failed to sync products from Sanity");
      }

      setLastSync(new Date().toISOString());

      const totalSynced = data?.total || 0;
      const updated = data?.updated || 0;
      const inserted = data?.inserted || 0;

      toast({
        title: "Sanity Sync Complete",
        description: `Successfully synced ${totalSynced} products (${updated} updated, ${inserted} new)`,
      });
    } catch (err: any) {
      console.error("Error syncing Sanity products:", err);
      toast({
        title: "Sync Failed",
        description: err.message || "Failed to sync products from Sanity",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
            <Database className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">Sanity.io</p>
              <Badge variant="outline" className="text-purple-600 border-purple-600">
                Connected
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Project: {projectId} / Dataset: {dataset}
            </p>
            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Last sync: {new Date(lastSync).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sanity-project-id">Project ID</Label>
          <Input
            id="sanity-project-id"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="e.g., 8h5l91ut"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sanity-dataset">Dataset</Label>
          <Input
            id="sanity-dataset"
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
            placeholder="e.g., production"
          />
        </div>
      </div>

      {/* Sync Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          onClick={handleSyncProducts}
          disabled={syncing || !organizationId}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Syncing Products...
            </>
          ) : (
            <>
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              Import Products from Sanity
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        This will import all fragrance products from your Sanity.io CMS including names, descriptions, scent notes, pricing, and images.
      </p>
    </div>
  );
}
