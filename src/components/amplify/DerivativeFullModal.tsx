import { useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  X, Check, Edit, Copy, CalendarIcon, MoreVertical, 
  Mail, Instagram, Twitter, Package, MessageSquare, FileText, Sparkles 
} from "lucide-react";
import { EditorialAssistantPanel } from "@/components/assistant/EditorialAssistantPanel";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { buildSequenceEmailsFromDerivative } from "@/lib/multiplyUtils";

interface DerivativeFullModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  derivative: {
    id: string;
    asset_type: string;
    generated_content: string;
    approval_status: string;
    platform_specs?: any;
  } | null;
  label: string;
  isScheduled?: boolean;
  scheduledDate?: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (content: string) => void;
  onCopy: () => void;
  onSchedule: () => void;
  onApproveAndSchedule: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onViewCalendar?: () => void;
  onSaveToLibrary?: (content: string) => void;
}

const DERIVATIVE_ICONS = {
  email: Mail,
  instagram: Instagram,
  twitter: Twitter,
  product: Package,
  sms: MessageSquare,
  email_3part: Mail,
  email_5part: Mail,
  email_7part: Mail,
};

export function DerivativeFullModal({
  open,
  onOpenChange,
  derivative,
  label,
  isScheduled,
  scheduledDate,
  onApprove,
  onReject,
  onEdit,
  onCopy,
  onSchedule,
  onApproveAndSchedule,
  onArchive,
  onDelete,
  onViewCalendar,
  onSaveToLibrary,
}: DerivativeFullModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [platformSpecsOpen, setPlatformSpecsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!derivative) return null;

  const Icon = DERIVATIVE_ICONS[derivative.asset_type as keyof typeof DERIVATIVE_ICONS] || FileText;
  
  // Check if this is an email sequence
  const isEmailSequence = derivative.asset_type.includes('part');
  const emailParts = isEmailSequence
    ? buildSequenceEmailsFromDerivative({
        id: derivative.id,
        generated_content: derivative.generated_content,
        platform_specs: derivative.platform_specs,
      })
    : [];

  const handleEditClick = () => {
    setEditedContent(derivative.generated_content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onEdit(editedContent);
    setIsEditing(false);
    // Also save to library if handler is provided
    if (onSaveToLibrary) {
      onSaveToLibrary(editedContent);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent("");
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const cursorPosition = e.target.selectionStart;
    setEditedContent(e.target.value);
    
    // Preserve cursor position after state update
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = cursorPosition;
        textareaRef.current.selectionEnd = cursorPosition;
      }
    });
  };

  const getStatusBadgeVariant = () => {
    switch (derivative.approval_status) {
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "h-[90vh] p-0 gap-0 flex flex-col",
        assistantOpen ? "max-w-[95vw]" : "max-w-5xl"
      )}>
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-medium text-foreground">{label}</h2>
              <Badge variant={getStatusBadgeVariant()} className="mt-1 text-xs capitalize">
                {derivative.approval_status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={assistantOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setAssistantOpen(!assistantOpen)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Director
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content Area with Optional Assistant */}
        <div className={cn(
          "flex-1 overflow-hidden",
          assistantOpen ? "grid grid-cols-[1fr_420px]" : ""
        )}>
          {/* Scrollable Content Area */}
          <div className="h-full overflow-y-auto p-6 space-y-6">
          {/* Scheduled Banner */}
          {isScheduled && scheduledDate && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">
                  Scheduled for {new Date(scheduledDate).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </div>
              {onViewCalendar && (
                <Button size="sm" variant="outline" onClick={onViewCalendar}>
                  View on Calendar
                </Button>
              )}
            </div>
          )}

          {/* Content Display/Edit */}
          {isEditing ? (
            <div className="space-y-4">
              <Textarea
                ref={textareaRef}
                value={editedContent}
                onChange={handleContentChange}
                className="min-h-[400px] font-sans text-base resize-none"
                placeholder="Edit your content..."
              />
              <div className="text-sm text-muted-foreground">
                {editedContent.length} characters
              </div>
            </div>
          ) : isEmailSequence && emailParts.length > 0 ? (
            <Accordion type="multiple" defaultValue={emailParts.map((_, i) => `part-${i}`)} className="space-y-3">
              {emailParts.map((part, index) => (
                <AccordionItem 
                  key={`part-${index}`} 
                  value={`part-${index}`}
                  className="border rounded-lg px-4 bg-muted/20"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <span className="font-medium">Email {index + 1} of {emailParts.length}</span>
                      {part.subject && (
                        <span className="text-sm text-muted-foreground">— {part.subject}</span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 pb-4">
                    <div className="space-y-3">
                      {part.subject && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">SUBJECT</p>
                          <p className="font-medium">{part.subject}</p>
                        </div>
                      )}
                      {part.preview && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">PREVIEW</p>
                          <p className="text-sm text-muted-foreground">{part.preview}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">CONTENT</p>
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                          {part.content}
                        </pre>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="bg-muted/30 rounded-lg p-6">
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground">
                {derivative.generated_content}
              </pre>
            </div>
          )}

          {/* Platform Specs (Collapsible) */}
          {derivative.platform_specs && Object.keys(derivative.platform_specs).length > 0 && (
            <Collapsible open={platformSpecsOpen} onOpenChange={setPlatformSpecsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span>Platform Details</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${platformSpecsOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="bg-muted/30 rounded-lg p-4">
                  <pre className="text-xs text-muted-foreground overflow-x-auto">
                    {JSON.stringify(derivative.platform_specs, null, 2)}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          </div>

          {/* Editorial Assistant Panel */}
          {assistantOpen && (
            <div className="h-full overflow-hidden border-l border-border/40 bg-background">
              <EditorialAssistantPanel
                onClose={() => setAssistantOpen(false)}
                initialContent={derivative.generated_content}
              />
            </div>
          )}
        </div>

        {/* Fixed Action Bar */}
        <div className="border-t bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left Actions */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onCopy}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>

            {/* Center Actions */}
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button size="sm" onClick={handleSaveEdit}>
                    Save Changes
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {derivative.approval_status === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" onClick={handleEditClick}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" onClick={onApproveAndSchedule} className="bg-primary hover:bg-primary-dark">
                        <Check className="h-4 w-4 mr-2" />
                        Approve & Schedule
                      </Button>
                      <Button size="sm" variant="destructive" onClick={onReject}>
                        <X className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </>
                  )}
                  {derivative.approval_status === 'approved' && !isScheduled && (
                    <Button size="sm" onClick={onSchedule}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Schedule
                    </Button>
                  )}
                  {derivative.approval_status === 'rejected' && (
                    <Button size="sm" onClick={onApprove}>
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Right Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                {!isEditing && (
                  <DropdownMenuItem onClick={handleEditClick}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onSaveToLibrary && (
                  <DropdownMenuItem onClick={() => onSaveToLibrary(derivative.generated_content)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Save Copy to Library
                  </DropdownMenuItem>
                )}
                {!isScheduled && (
                  <DropdownMenuItem onClick={onSchedule}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Schedule
                  </DropdownMenuItem>
                )}
                {derivative.approval_status === 'approved' && (
                  <DropdownMenuItem onClick={onReject}>
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </DropdownMenuItem>
                )}
                {derivative.approval_status === 'rejected' && (
                  <DropdownMenuItem onClick={onApprove}>
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onArchive}>
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  Delete Permanently
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
