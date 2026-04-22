import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { X, Save, Copy, Mail, Sparkles } from "lucide-react";
import { EditorialAssistantPanel } from "@/components/assistant/EditorialAssistantPanel";
import { AutosaveIndicator } from "@/components/ui/autosave-indicator";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AUTOSAVE_CONFIG } from "@/config/autosaveConfig";
import { useToast } from "@/hooks/use-toast";
import {
  buildSequenceEmailsFromDerivative,
  buildSequencePlatformSpecsFromContent,
  serializeSequenceEmails,
} from "@/lib/multiplyUtils";

interface EmailPart {
  id: string;
  sequenceNumber: number;
  subject: string;
  preview: string;
  content: string;
  charCount: number;
}

interface EmailSequenceEditorProps {
  open: boolean;
  title: string;
  initialContent: string;
  initialPlatformSpecs?: any;
  contentId?: string;
  contentType?: string;
  category?: "master" | "derivative" | "output"; // Which type of content
  onSave: (content: string) => void;
  onClose: () => void;
}

// Convert parsed email parts to editor format
function buildEmailParts(content: string, contentId?: string, platformSpecs?: any): EmailPart[] {
  return buildSequenceEmailsFromDerivative({
    id: contentId || "email",
    generated_content: content,
    platform_specs: platformSpecs,
  });
}

export function EmailSequenceEditor({ 
  open, 
  title, 
  initialContent, 
  initialPlatformSpecs,
  contentId,
  contentType,
  category = "master",
  onSave, 
  onClose 
}: EmailSequenceEditorProps) {
  const { toast } = useToast();
  const [emailParts, setEmailParts] = useState<EmailPart[]>([]);
  const [selectedEmailIndex, setSelectedEmailIndex] = useState(0);

  // Determine table and field based on category
  const tableName = category === "master" 
    ? "master_content" 
    : category === "derivative" 
    ? "derivative_assets" 
    : "outputs";
  
  const fieldName = category === "master" ? "full_content" : "generated_content";
  const serializedContent = serializeSequenceEmails(emailParts);
  const sequencePlatformSpecs =
    category === "derivative"
      ? buildSequencePlatformSpecsFromContent(serializedContent, contentType)
      : undefined;

  // Auto-save configuration
  const { saveStatus, lastSavedAt, forceSave } = useAutoSave({
    content: serializedContent,
    contentId,
    contentName: title,
    delay: AUTOSAVE_CONFIG.STANDARD_DELAY,
    tableName,
    fieldName,
    extraUpdateFields: sequencePlatformSpecs ? { platform_specs: sequencePlatformSpecs } : undefined,
  });

  // Initialize email parts from content
  useEffect(() => {
    if (open && initialContent) {
      const parts = buildEmailParts(initialContent, contentId, initialPlatformSpecs);
      setEmailParts(parts);
      setSelectedEmailIndex(0);
    }
  }, [open, initialContent, initialPlatformSpecs, contentId]);

  const handleEmailPartChange = (
    partId: string, 
    field: 'subject' | 'preview' | 'content', 
    value: string
  ) => {
    setEmailParts(prev =>
      prev.map(part =>
        part.id === partId
          ? { 
              ...part, 
              [field]: value, 
              charCount: field === 'content' ? value.length : part.charCount 
            }
          : part
      )
    );
  };

  const handleSave = async () => {
    await forceSave();
    const serialized = serializeSequenceEmails(emailParts);
    onSave(serialized);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "Email content copied to clipboard",
    });
  };

  const handleCopyAll = () => {
    const serialized = serializeSequenceEmails(emailParts);
    navigator.clipboard.writeText(serialized);
    toast({
      title: "Copied",
      description: "All emails copied to clipboard",
    });
  };

  // Get the number of emails for display
  const emailCount = emailParts.length;
  const emailLabel = emailCount === 1 ? "Email" : `${emailCount}-Part Email Sequence`;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-brand-vellum">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-brand-stone bg-brand-parchment">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-brand-charcoal hover:text-brand-ink"
          >
            <X className="w-4 h-4 mr-2" />
            Exit Editor
          </Button>
          <Badge variant="secondary" className="gap-2 bg-brand-brass/10 text-brand-brass border-brand-brass/20">
            <Mail className="w-3.5 h-3.5" />
            {emailLabel}
          </Badge>
        </div>
        
        <h1 className="text-lg font-serif font-semibold text-brand-ink truncate max-w-md">
          {title || "Edit Email Sequence"}
        </h1>

        <div className="flex items-center gap-3">
          <AutosaveIndicator 
            saveStatus={saveStatus} 
            lastSavedAt={lastSavedAt}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAll}
            className="border-brand-stone text-brand-charcoal"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy All
          </Button>
          <Button
            variant="brass"
            size="sm"
            onClick={handleSave}
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Main Content Area - Split View */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Email Sequence Editor (60%) */}
        <div className="flex-1 overflow-y-auto border-r border-brand-stone py-6 px-4">
          <div className="max-w-3xl mx-auto">
            <p className="text-sm mb-6 text-brand-charcoal">
              Edit each email in your sequence. Changes are auto-saved.
            </p>
            
            {/* Email Parts Accordion */}
            <Accordion 
              type="multiple" 
              defaultValue={emailParts.map(e => e.id)} 
              className="space-y-3"
            >
              {emailParts.map((email) => (
                <AccordionItem 
                  key={email.id} 
                  value={email.id}
                  className="border rounded-lg overflow-hidden border-brand-stone bg-brand-parchment"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-brand-vellum/50">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-brand-brass text-brand-brass">
                          Email {email.sequenceNumber}
                        </Badge>
                        <span className="text-sm font-medium text-brand-ink truncate max-w-xs">
                          {email.subject || 'Untitled'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {email.charCount} chars
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-4">
                    {/* Subject Line */}
                    <div>
                      <Label className="text-sm font-medium mb-2 text-brand-ink">
                        Subject Line
                      </Label>
                      <Input
                        value={email.subject}
                        onChange={(e) => handleEmailPartChange(email.id, 'subject', e.target.value)}
                        placeholder="Enter subject line..."
                        className="mt-1 bg-brand-vellum border-brand-stone focus:border-brand-brass focus:ring-brand-brass/20"
                      />
                    </div>
                    
                    {/* Preview Text */}
                    <div>
                      <Label className="text-sm font-medium mb-2 text-brand-ink">
                        Preview Text
                      </Label>
                      <Input
                        value={email.preview}
                        onChange={(e) => handleEmailPartChange(email.id, 'preview', e.target.value)}
                        placeholder="Enter preview text..."
                        className="mt-1 bg-brand-vellum border-brand-stone focus:border-brand-brass focus:ring-brand-brass/20"
                      />
                    </div>
                    
                    {/* Email Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium text-brand-ink">
                          Email Body
                        </Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {email.charCount} chars
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(email.content)}
                            className="h-7 px-2 text-xs"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={email.content}
                        onChange={(e) => handleEmailPartChange(email.id, 'content', e.target.value)}
                        className="min-h-64 bg-brand-vellum border-brand-stone focus:border-brand-brass focus:ring-brand-brass/20"
                        placeholder="Write your email content..."
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>

        {/* Right Panel - Editorial Director (40%) */}
        <div className="w-[500px] overflow-hidden flex flex-col bg-brand-parchment">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-brand-stone bg-brand-brass/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-brass/10">
                <Sparkles className="w-4 h-4 text-brand-brass" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-serif font-semibold text-sm sm:text-base text-brand-ink">
                  Editorial Director
                </h2>
                <p className="text-xs text-muted-foreground">
                  <Mail className="w-3 h-3 inline mr-1 text-brand-brass" />
                  {emailLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Assistant Panel */}
          <div className="flex-1 overflow-hidden">
            <EditorialAssistantPanel
              onClose={onClose}
              initialContent={emailParts[selectedEmailIndex]?.content || serializeEmailParts(emailParts)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
