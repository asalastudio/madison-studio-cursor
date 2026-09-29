import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Send, Loader2, CheckCircle, AlertCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";

interface ESPExportProps {
  html: string;
  subject: string;
}

type ESPType = "klaviyo" | "mailchimp" | "sendinblue" | "constantcontact";

interface SavedConnection {
  id: string;
  esp_type: ESPType;
  webhook_url: string;
  connection_name: string | null;
  last_tested_at: string | null;
}

export function ESPExport({ html, subject }: ESPExportProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [esp, setEsp] = useState<ESPType>("klaviyo");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [showNewConnection, setShowNewConnection] = useState(false);
  const { organization } = useOrganization();

  useEffect(() => {
    if (open && organization) {
      loadSavedConnections();
    }
  }, [open, organization]);

  const loadSavedConnections = async () => {
    if (!organization) return;

    const { data, error } = await supabase
      .from("esp_connections")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading connections:", error);
      return;
    }

    setSavedConnections((data || []) as SavedConnection[]);
  };

  const handleSelectConnection = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    const connection = savedConnections.find((c) => c.id === connectionId);
    if (connection) {
      setEsp(connection.esp_type);
      setWebhookUrl(connection.webhook_url);
      setShowNewConnection(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!organization || !webhookUrl.trim()) {
      toast.error("Please enter a webhook URL");
      return;
    }

    const { error } = await supabase.from("esp_connections").insert({
      organization_id: organization.id,
      esp_type: esp,
      webhook_url: webhookUrl,
      connection_name: connectionName || `${esp} connection`,
    });

    if (error) {
      console.error("Error saving connection:", error);
      toast.error("Failed to save connection");
      return;
    }

    toast.success("Connection saved");
    await loadSavedConnections();
    setShowNewConnection(false);
    setConnectionName("");
  };

  const handleDeleteConnection = async (connectionId: string) => {
    const { error } = await supabase
      .from("esp_connections")
      .delete()
      .eq("id", connectionId);

    if (error) {
      toast.error("Failed to delete connection");
      return;
    }

    toast.success("Connection deleted");
    await loadSavedConnections();
    if (selectedConnectionId === connectionId) {
      setSelectedConnectionId("");
      setWebhookUrl("");
    }
  };

  const handleTestConnection = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Please enter a webhook URL");
      return;
    }

    setTesting(true);
    try {
      const now = new Date();
      const datetime = now.toISOString();
      
      // Build enhanced test payload
      const brandName = organization?.name || "Your brand";
      const settings = organization?.settings as { email_sender_name?: string; email_sender_email?: string } | null;
      const fromName = settings?.email_sender_name || brandName;
      const fromEmail = settings?.email_sender_email || "";
      
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "no-cors",
        body: JSON.stringify({
          test: true,
          esp,
          timestamp: datetime,
          datetime,
          send_time: datetime,
          brand_name: brandName,
          from_name: fromName,
          from_email: fromEmail,
          subject: "Test Campaign",
          name: `${brandName} - Test`.substring(0, 255),
        }),
      });

      // Update last_tested_at if this is a saved connection
      if (selectedConnectionId) {
        await supabase
          .from("esp_connections")
          .update({ last_tested_at: new Date().toISOString() })
          .eq("id", selectedConnectionId);
      }

      toast.success("Connection test sent", {
        description: "Check your Make.com scenario to confirm",
      });
    } catch (error) {
      console.error("Error testing connection:", error);
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleExport = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Please enter your Make.com webhook URL");
      return;
    }

    setLoading(true);
    try {
      // Create ISO 8601 datetime for immediate send
      const now = new Date();
      const datetime = now.toISOString();
      
      // Build enhanced Klaviyo payload with all required fields
      const brandName = organization?.name || "Your brand";
      const settings = organization?.settings as { email_sender_name?: string; email_sender_email?: string } | null;
      const fromName = settings?.email_sender_name || brandName;
      const fromEmail = settings?.email_sender_email || "";
      const campaignSubject = subject || "New Campaign";
      const campaignName = `${brandName} - ${campaignSubject}`.substring(0, 255);
      
      // Send webhook payload
      fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors",
        body: JSON.stringify({
          esp,
          timestamp: datetime,
          datetime,
          send_time: datetime,
          brand_name: brandName,
          from_name: fromName,
          from_email: fromEmail,
          subject: campaignSubject,
          name: campaignName,
          html,
        }),
      }).catch(err => {
        console.error("Webhook error:", err);
      });

      // Show success immediately (no-cors doesn't allow response checking)
      toast.success("Email sent to ESP", {
        description: "Check your Make.com scenario history to confirm",
        duration: 5000,
      });
      
      setOpen(false);
    } catch (error) {
      console.error("Error pushing to ESP:", error);
      toast.error("Failed to push to ESP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Send className="w-4 h-4" />
        Push to ESP
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Push to Email Service Provider</DialogTitle>
            <DialogDescription>
              Send your email to your ESP via Make.com webhook
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Saved Connections */}
            {savedConnections.length > 0 && !showNewConnection && (
              <div className="space-y-2">
                <Label>Saved Connections</Label>
                <div className="space-y-2">
                  {savedConnections.map((conn) => (
                    <div
                      key={conn.id}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedConnectionId === conn.id
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => handleSelectConnection(conn.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">
                            {conn.connection_name || conn.esp_type}
                          </span>
                          {conn.last_tested_at && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {conn.webhook_url.substring(0, 40)}...
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConnection(conn.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Connection */}
            {!showNewConnection && (
              <Button
                variant="outline"
                onClick={() => setShowNewConnection(true)}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Connection
              </Button>
            )}

            {/* New Connection Form */}
            {showNewConnection && (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label>Connection Name (Optional)</Label>
                  <Input
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="My Klaviyo Connection"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email Service Provider</Label>
                  <Select value={esp} onValueChange={(value: any) => setEsp(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="klaviyo">Klaviyo</SelectItem>
                      <SelectItem value="mailchimp">Mailchimp</SelectItem>
                      <SelectItem value="sendinblue">Sendinblue</SelectItem>
                      <SelectItem value="constantcontact">Constant Contact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Make.com Webhook URL</Label>
                  <Input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hook.us1.make.com/..."
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveConnection} className="flex-1">
                    Save Connection
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNewConnection(false);
                      setWebhookUrl("");
                      setConnectionName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Setup Guides */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="guides">
                <AccordionTrigger>How to connect to your ESP</AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Klaviyo</h4>
                    <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                      <li>Go to Make.com and create a new scenario</li>
                      <li>Add a Webhook trigger and copy the URL</li>
                      <li>Add Klaviyo module to create campaign or template</li>
                      <li>Map the HTML and subject fields from webhook</li>
                      <li>Activate your scenario</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium">Mailchimp</h4>
                    <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                      <li>Create Make.com scenario with Webhook trigger</li>
                      <li>Add Mailchimp "Create Campaign" module</li>
                      <li>Select your audience and campaign settings</li>
                      <li>Map HTML content from webhook data</li>
                      <li>Test and activate</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium">Constant Contact</h4>
                    <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                      <li>Set up Make.com Webhook trigger</li>
                      <li>Add Constant Contact module</li>
                      <li>Connect your account and select action</li>
                      <li>Map email content from webhook</li>
                      <li>Save and activate scenario</li>
                    </ol>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Action Buttons */}
            {(selectedConnectionId || webhookUrl) && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing || !webhookUrl}
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={loading || !webhookUrl}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Push to {esp}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
