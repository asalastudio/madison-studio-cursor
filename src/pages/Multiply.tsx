import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VideoHelpTrigger } from "@/components/help/VideoHelpTrigger";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Archive, Mail, MessageSquare, Tag,
  FileText, CheckCircle2, XCircle, ChevronDown, ChevronRight, Copy,
  Calendar, Edit, Loader2, AlertCircle, Video, Bookmark,
  Briefcase, Share2, ArrowLeft, Image as ImageIcon, Film, Layers, BookOpen
} from "lucide-react";
import { LibrarianTrigger } from "@/components/librarian";
import { EditorialDirectorSplitScreen } from "@/components/multiply/EditorialDirectorSplitScreen";
import { SavePromptDialog } from "@/components/prompt-library/SavePromptDialog";
import { ScheduleButton } from "@/components/forge/ScheduleButton";
import { DerivativeFullModal } from "@/components/amplify/DerivativeFullModal";
import { DerivativeTypeSelector } from "@/components/multiply/DerivativeTypeSelector";

// Phase 1-3 UX Redesign Components
import {
  CollapsibleMasterContent,
  UnifiedGenerateButton,
  VisualPromptsToggle,
  DerivativeCategoryAccordion,
  MadisonSuggestionCard,
  MULTIPLY_FEATURE_FLAGS,
} from "@/components/multiply";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOrganization } from "@/hooks/useOrganization";
import { buildSequenceEmailsFromDerivative, buildSequencePlatformSpecsFromContent } from "@/lib/multiplyUtils";
import fannedPagesImage from "@/assets/fanned-pages-new.jpg";
import ticketIcon from "@/assets/ticket-icon.png";
import envelopeIcon from "@/assets/envelope-icon.png";
import instagramIcon from "@/assets/instagram-icon-clean.png";

// Visual prompt imports
import { ImagePackResults } from "@/components/multiply/ImagePackResults";
import { VideoScriptResults } from "@/components/multiply/VideoScriptResults";
import { ProductBackgroundResults } from "@/components/multiply/ProductBackgroundResults";
import {
  generateImagePackFromContent,
  generateVideoScriptFromContent,
  generateProductBackgroundsFromContent,
  type ImagePackOutput,
  type VideoScriptOutput,
  type ProductBackgroundOutput,
  type ContentAnalysis,
} from "@/lib/agents/contentToVisualPrompts";

interface DerivativeType {
  id: string;
  name: string;
  description: string;
  icon: any;
  iconColor: string;
  charLimit?: number;
  isSequence?: boolean;
  iconImage?: string;
}

interface DerivativeContent {
  id: string;
  typeId: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  charCount: number;
  isSequence?: boolean;
  master_content_id?: string;
  sequenceEmails?: {
    id: string;
    sequenceNumber: number;
    subject: string;
    preview: string;
    content: string;
    charCount: number;
  }[];
  platformSpecs?: any;
  asset_type?: string;
  generated_content?: string;
}

interface MasterContent {
  id: string;
  title: string;
  contentType: string;
  collection?: string;
  content: string;
  wordCount: number;
  charCount: number;
}

const TOP_DERIVATIVE_TYPES: DerivativeType[] = [
  {
    id: "email_3part",
    name: "3-Part Email Series",
    description: "Sequential email nurture campaign",
    icon: Mail,
    iconImage: envelopeIcon,
    iconColor: "#8B7355",
    isSequence: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Instagram posts and captions",
    icon: null,
    iconImage: instagramIcon,
    iconColor: "#E4405F",
    charLimit: 2200,
  },
  {
    id: "product",
    name: "Product Description",
    description: "Product page descriptions",
    icon: Tag,
    iconImage: ticketIcon,
    iconColor: "#3A4A3D",
    charLimit: 500,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional network posts",
    icon: Briefcase,
    iconColor: "#0A66C2",
    charLimit: 3000,
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Video descriptions & scripts",
    icon: Video,
    iconColor: "#FF0000",
    charLimit: 5000,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Community engagement posts",
    icon: Share2,
    iconColor: "#1877F2",
    charLimit: 2000,
  },
];

// Visual prompt derivative types
const VISUAL_DERIVATIVE_TYPES: DerivativeType[] = [
  {
    id: "image_pack",
    name: "Image Pack",
    description: "Hero + Social + Email image prompts",
    icon: ImageIcon,
    iconColor: "#B8956A",
  },
  {
    id: "video_script",
    name: "Video Script",
    description: "AI video prompts for multiple formats",
    icon: Film,
    iconColor: "#9333EA",
  },
  {
    id: "product_backgrounds",
    name: "Product Backgrounds",
    description: "Scene prompts for product photography",
    icon: Layers,
    iconColor: "#059669",
  },
];

const ADDITIONAL_DERIVATIVE_TYPES: DerivativeType[] = [
  {
    id: "email",
    name: "Email",
    description: "Newsletter-style email",
    icon: Mail,
    iconColor: "#B8956A",
    charLimit: 2000,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    description: "Pinterest pin descriptions",
    icon: FileText,
    iconColor: "#E60023",
    charLimit: 500,
  },
  {
    id: "sms",
    name: "SMS",
    description: "SMS marketing messages",
    icon: MessageSquare,
    iconColor: "#6B2C3E",
    charLimit: 160,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "TikTok video scripts",
    icon: Video,
    iconColor: "#000000",
    charLimit: 300,
  },
  {
    id: "email_5part",
    name: "5-Part Email Series",
    description: "Extended email sequence",
    icon: Mail,
    iconColor: "#A0826D",
    isSequence: true,
  },
  {
    id: "email_7part",
    name: "7-Part Email Series",
    description: "Comprehensive email journey",
    icon: Mail,
    iconColor: "#6B5D52",
    isSequence: true,
  },
];

const DERIVATIVE_TYPES = [...TOP_DERIVATIVE_TYPES, ...ADDITIONAL_DERIVATIVE_TYPES];

export default function Multiply() {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrganizationId } = useOnboarding();
  const [selectedMaster, setSelectedMaster] = useState<MasterContent | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [derivatives, setDerivatives] = useState<DerivativeContent[]>([]);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [splitScreenMode, setSplitScreenMode] = useState(false);
  const [selectedDerivativeForDirector, setSelectedDerivativeForDirector] = useState<DerivativeContent | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // 🚧 FEATURE FLAG: Toggle between old and new DerivativeTypeSelector
  // Set to false to test the new component, true to use old code
  const useOldSelector = false;
  const [saveTitle, setSaveTitle] = useState("");
  const [userContent, setUserContent] = useState<MasterContent | null>(null);
  const [savePromptDialogOpen, setSavePromptDialogOpen] = useState(false);
  const [masterContentList, setMasterContentList] = useState<MasterContent[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  const [derivativeSaveDialogOpen, setDerivativeSaveDialogOpen] = useState(false);
  const [derivativeToSave, setDerivativeToSave] = useState<DerivativeContent | null>(null);
  const [derivativeSaveTitle, setDerivativeSaveTitle] = useState("");

  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [isSavingDerivative, setIsSavingDerivative] = useState(false);
  const saveInFlightRef = useRef(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [contentFromNavigation, setContentFromNavigation] = useState(false);

  // Modal state for derivative viewing/editing
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDerivativeForModal, setSelectedDerivativeForModal] = useState<DerivativeContent | null>(null);

  // Visual prompt state
  const [selectedVisualTypes, setSelectedVisualTypes] = useState<Set<string>>(new Set());
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const [imagePackResult, setImagePackResult] = useState<{ analysis: ContentAnalysis; images: ImagePackOutput } | null>(null);
  const [videoScriptResult, setVideoScriptResult] = useState<{ analysis: ContentAnalysis; videos: VideoScriptOutput } | null>(null);
  const [productBgResult, setProductBgResult] = useState<{ analysis: ContentAnalysis; backgrounds: ProductBackgroundOutput } | null>(null);

  // Track if we selected master via navigation
  const selectedViaNavigationRef = useRef(false);

  useEffect(() => {
    const loadMasterContent = async () => {
      if (!currentOrganizationId) return;

      // Multi-source master selection: URL → state → localStorage → fallback
      let selectedId: string | null = null;
      let selectionSource: 'url' | 'state' | 'localStorage' | 'fallback' = 'fallback';

      // 1. Check URL param
      const urlId = searchParams.get('id') || searchParams.get('master');
      if (urlId) {
        selectedId = urlId;
        selectionSource = 'url';
      }

      // 2. Check navigation state
      if (!selectedId && location.state?.contentId) {
        selectedId = location.state.contentId;
        selectionSource = 'state';
      }

      // 3. Check localStorage
      if (!selectedId) {
        const localId = localStorage.getItem('lastEditedMasterId');
        if (localId) {
          selectedId = localId;
          selectionSource = 'localStorage';
        }
      }

      // If we have a specific ID from url/state/localStorage, fetch it immediately
      if (selectedId && selectionSource !== 'fallback') {
        try {
          const { data, error } = await supabase
            .from('master_content')
            .select('id, title, content_type, full_content, word_count, collection')
            .eq('id', selectedId)
            .single();

          if (error) throw error;

          if (data) {
            const masterContent = {
              id: data.id,
              title: data.title || 'Untitled',
              contentType: data.content_type || 'Content',
              collection: data.collection || undefined,
              content: data.full_content || '',
              wordCount: data.word_count || 0,
              charCount: data.full_content?.length || 0,
            };

            setSelectedMaster(masterContent);
            selectedViaNavigationRef.current = true;

            // Update URL if it doesn't have ?id
            if (searchParams.get('id') !== selectedId) {
              navigate(`/multiply?id=${selectedId}`, { replace: true });
            }

            toast({
              title: "Content loaded",
              description: `Loaded master: ${masterContent.title} (${masterContent.charCount} chars)`,
            });
          }
        } catch (e) {
          console.error('[Multiply] Error loading specific content:', e);
        }
      }

      // Always load the list for dropdown
      setLoadingContent(true);
      try {
        const { data, error } = await supabase
          .from('master_content')
          .select('id, title, content_type, full_content, word_count, collection')
          .eq('organization_id', currentOrganizationId)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        if (data && data.length > 0) {
          const formatted = data.map(item => ({
            id: item.id,
            title: item.title || 'Untitled',
            contentType: item.content_type || 'Content',
            collection: item.collection || undefined,
            content: item.full_content || '',
            wordCount: item.word_count || 0,
            charCount: item.full_content?.length || 0,
          }));

          setMasterContentList(formatted);

          // Only auto-select from database if we didn't arrive via navigation
          if (!selectedMaster && !selectedViaNavigationRef.current) {
            setSelectedMaster(formatted[0]);
          }
        }
      } catch (e) {
        console.error('[Multiply] Error loading master content list:', e);
      } finally {
        setLoadingContent(false);
      }
    };

    loadMasterContent();
  }, [currentOrganizationId, searchParams]);

  // Clear derivatives when selectedMaster changes
  useEffect(() => {
    setDerivatives([]);
  }, [selectedMaster?.id]);


  const toggleTypeSelection = (typeId: string) => {
    const newSet = new Set(selectedTypes);
    if (newSet.has(typeId)) {
      newSet.delete(typeId);
    } else {
      newSet.add(typeId);
    }
    setSelectedTypes(newSet);
  };


  const selectAll = () => {
    setSelectedTypes(new Set(DERIVATIVE_TYPES.map(t => t.id)));
  };

  const deselectAll = () => {
    setSelectedTypes(new Set());
  };

  const generateDerivatives = async () => {
    if (selectedTypes.size === 0) {
      toast({
        title: "No derivatives selected",
        description: "Please select at least one derivative type",
        variant: "destructive"
      });
      return;
    }

    if (!selectedMaster || !selectedMaster.content) {
      toast({
        title: "No content selected",
        description: "Please create or select master content first",
        variant: "destructive"
      });
      return;
    }

    if (!selectedMaster.id) {
      toast({
        title: "Error",
        description: "Master content must be saved before generating derivatives",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Re-fetch latest content to ensure we have the most up-to-date version
      const { data: latestContent, error: fetchError } = await supabase
        .from('master_content')
        .select('id, title, content_type, full_content, word_count, collection')
        .eq('id', selectedMaster.id)
        .single();

      if (fetchError) {
        console.error('[Multiply] Error fetching latest content:', fetchError);
        throw new Error('Failed to fetch latest content');
      }

      const contentId = selectedMaster.id;
      const masterContentToUse = latestContent.full_content || selectedMaster.content;

      console.log('[Multiply] Invoking repurpose-content edge function:', {
        masterContentId: contentId,
        derivativeTypes: Array.from(selectedTypes),
        contentLength: masterContentToUse?.length || 0,
        hasCollection: !!selectedMaster.collection
      });

      const { data, error } = await supabase.functions.invoke('repurpose-content', {
        body: {
          masterContentId: contentId,
          derivativeTypes: Array.from(selectedTypes),
          masterContent: {
            full_content: masterContentToUse,
            collection: selectedMaster.collection,
          }
        }
      });

      console.log('[Multiply] Edge function response:', {
        hasError: !!error,
        hasData: !!data,
        errorMessage: error?.message,
        errorContext: error?.context,
        dataSuccess: data?.success,
        derivativesCount: data?.derivatives?.length
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate derivatives');

      const newDerivatives: DerivativeContent[] = [];
      const newExpandedTypes = new Set<string>();

      data.derivatives.forEach((derivative: any) => {
        const typeId = derivative.asset_type;
        const isSequenceType = typeId.includes('email_') && (typeId.includes('3part') || typeId.includes('5part') || typeId.includes('7part'));
        const sequenceEmails = isSequenceType ? buildSequenceEmailsFromDerivative(derivative) : [];

        // Defensive check: verify master_content_id matches
        if (derivative.master_content_id && derivative.master_content_id !== selectedMaster.id) {
          console.error('[Multiply] Derivative master_content_id mismatch!', {
            derivativeId: derivative.id,
            derivativeMasterId: derivative.master_content_id,
            selectedMasterId: selectedMaster.id
          });
        }

        newDerivatives.push({
          id: derivative.id,
          typeId,
          content: derivative.generated_content,
          status: derivative.approval_status,
          charCount: derivative.generated_content.length,
          isSequence: isSequenceType && sequenceEmails.length > 0,
          sequenceEmails: sequenceEmails.length > 0 ? sequenceEmails : undefined,
          platformSpecs: derivative.platform_specs,
          asset_type: derivative.asset_type,
          generated_content: derivative.generated_content,
          master_content_id: derivative.master_content_id,
        });

        newExpandedTypes.add(typeId);
      });

      setDerivatives((prev) => [...prev, ...newDerivatives]);
      setExpandedTypes(newExpandedTypes);
      setSelectedTypes(new Set());

      toast({
        title: "Derivatives Generated",
        description: `Successfully generated ${newDerivatives.length} derivative${newDerivatives.length !== 1 ? 's' : ''}`,
      });
    } catch (error: any) {
      console.error('Error generating derivatives:', error);

      // Enhanced error handling - extract detailed error message
      let errorMessage = error.message || "Failed to generate derivatives. Please try again.";

      // Try to parse structured error from edge function
      if (error.context?.body) {
        try {
          const parsed = typeof error.context.body === 'string'
            ? JSON.parse(error.context.body)
            : error.context.body;
          if (parsed.error) {
            errorMessage = parsed.error;
          } else if (parsed.message) {
            errorMessage = parsed.message;
          }
        } catch (e) {
          console.error('Error parsing backend error:', e);
        }
      }

      // Handle specific error types
      if (error.message?.includes('Failed to send a request') || error.message?.includes('NetworkError')) {
        errorMessage = "Unable to connect to the server. Please check your internet connection and try again.";
      } else if (error.message?.includes('GEMINI_API_KEY') || errorMessage.includes('GEMINI_API_KEY')) {
        errorMessage = "AI service is not properly configured (missing Gemini API key). Please contact support.";
      } else if (error.message?.includes('429') || error.context?.status === 429) {
        errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (error.message?.includes('402') || error.context?.status === 402) {
        errorMessage = "Payment required. Please add AI credits to your workspace.";
      } else if (error.message?.includes('401') || error.context?.status === 401) {
        errorMessage = "Authentication failed. Please sign out and sign back in.";
      } else if (error.message?.includes('404') || error.context?.status === 404) {
        errorMessage = "Content not found. Please refresh the page and try again.";
      }

      toast({
        title: "Generation failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleExpanded = (typeId: string) => {
    const newSet = new Set(expandedTypes);
    if (newSet.has(typeId)) {
      newSet.delete(typeId);
    } else {
      newSet.add(typeId);
    }
    setExpandedTypes(newSet);
  };

  // Visual prompt generation handler
  const generateVisualPrompts = async () => {
    if (selectedVisualTypes.size === 0) {
      toast({
        title: "No visual types selected",
        description: "Please select at least one visual prompt type",
        variant: "destructive"
      });
      return;
    }

    const sourceContent = selectedMaster || userContent;
    if (!sourceContent?.content) {
      toast({
        title: "No content available",
        description: "Please select master content or enter your own",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingVisual(true);

    // Clear previous results
    setImagePackResult(null);
    setVideoScriptResult(null);
    setProductBgResult(null);

    try {
      const content = sourceContent.content;
      const title = sourceContent.title;

      // Generate each selected type in parallel
      const promises: Promise<void>[] = [];

      if (selectedVisualTypes.has('image_pack')) {
        promises.push(
          generateImagePackFromContent(content, title, undefined, currentOrganizationId || undefined)
            .then(result => setImagePackResult(result))
        );
      }

      if (selectedVisualTypes.has('video_script')) {
        promises.push(
          generateVideoScriptFromContent(content, title, currentOrganizationId || undefined)
            .then(result => setVideoScriptResult(result))
        );
      }

      if (selectedVisualTypes.has('product_backgrounds')) {
        promises.push(
          generateProductBackgroundsFromContent(content, title, undefined, currentOrganizationId || undefined)
            .then(result => setProductBgResult(result))
        );
      }

      await Promise.all(promises);

      toast({
        title: "Visual prompts generated!",
        description: `Generated ${selectedVisualTypes.size} visual prompt pack${selectedVisualTypes.size > 1 ? 's' : ''}`,
      });

    } catch (error: any) {
      console.error('[Multiply] Visual prompt generation error:', error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate visual prompts",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingVisual(false);
    }
  };

  const toggleVisualType = (typeId: string) => {
    const newSet = new Set(selectedVisualTypes);
    if (newSet.has(typeId)) {
      newSet.delete(typeId);
    } else {
      newSet.add(typeId);
    }
    setSelectedVisualTypes(newSet);
  };

  const handleOpenModal = (derivative: DerivativeContent) => {
    setSelectedDerivativeForModal(derivative);
    setModalOpen(true);
  };

  const handleSaveEdit = async (newContent: string) => {
    if (!selectedDerivativeForModal) return;

    try {
      const derivativeType = selectedDerivativeForModal.asset_type || selectedDerivativeForModal.typeId;
      const isSequenceType = derivativeType.includes('email_');
      const updatedPlatformSpecs = isSequenceType
        ? {
            ...selectedDerivativeForModal.platformSpecs,
            ...buildSequencePlatformSpecsFromContent(newContent, derivativeType),
          }
        : selectedDerivativeForModal.platformSpecs;
      const updatedSequenceEmails = isSequenceType
        ? buildSequenceEmailsFromDerivative({
            id: selectedDerivativeForModal.id,
            generated_content: newContent,
            platform_specs: updatedPlatformSpecs,
          })
        : undefined;

      // Update database
      const { error } = await supabase
        .from('derivative_assets')
        .update({
          generated_content: newContent,
          ...(isSequenceType ? { platform_specs: updatedPlatformSpecs } : {}),
        })
        .eq('id', selectedDerivativeForModal.id);

      if (error) throw error;

      // Update local state
      setDerivatives(prev =>
        prev.map(d =>
          d.id === selectedDerivativeForModal.id
            ? {
                ...d,
                content: newContent,
                generated_content: newContent,
                charCount: newContent.length,
                platformSpecs: updatedPlatformSpecs,
                sequenceEmails: updatedSequenceEmails,
                isSequence: isSequenceType && !!updatedSequenceEmails?.length,
              }
            : d
        )
      );

      // Update modal state
      setSelectedDerivativeForModal(prev =>
        prev
          ? {
              ...prev,
              content: newContent,
              generated_content: newContent,
              platformSpecs: updatedPlatformSpecs,
              sequenceEmails: updatedSequenceEmails,
              isSequence: isSequenceType && !!updatedSequenceEmails?.length,
            }
          : null
      );

      toast({
        title: "Changes saved",
        description: "Your edits have been saved to the database.",
      });
    } catch (error: any) {
      toast({
        title: "Error saving changes",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleApproveDerivative = async () => {
    if (!selectedDerivativeForModal) return;

    try {
      const { error } = await supabase
        .from('derivative_assets')
        .update({ approval_status: 'approved' })
        .eq('id', selectedDerivativeForModal.id);

      if (error) throw error;

      setDerivatives(prev =>
        prev.map(d =>
          d.id === selectedDerivativeForModal.id
            ? { ...d, status: 'approved' }
            : d
        )
      );

      setSelectedDerivativeForModal(prev =>
        prev ? { ...prev, status: 'approved' } : null
      );

      toast({
        title: "Derivative approved",
        description: "The derivative has been marked as approved.",
      });
    } catch (error: any) {
      toast({
        title: "Error approving derivative",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRejectDerivative = async () => {
    if (!selectedDerivativeForModal) return;

    try {
      const { error } = await supabase
        .from('derivative_assets')
        .update({ approval_status: 'rejected' })
        .eq('id', selectedDerivativeForModal.id);

      if (error) throw error;

      setDerivatives(prev =>
        prev.map(d =>
          d.id === selectedDerivativeForModal.id
            ? { ...d, status: 'rejected' }
            : d
        )
      );

      setSelectedDerivativeForModal(prev =>
        prev ? { ...prev, status: 'rejected' } : null
      );

      toast({
        title: "Derivative rejected",
        description: "The derivative has been marked as rejected.",
      });
    } catch (error: any) {
      toast({
        title: "Error rejecting derivative",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleScheduleDerivative = () => {
    // Schedule functionality handled by ScheduleButton component
  };

  const handleArchiveDerivative = async () => {
    if (!selectedDerivativeForModal) return;

    try {
      const { error } = await supabase
        .from('derivative_assets')
        .update({ is_archived: true })
        .eq('id', selectedDerivativeForModal.id);

      if (error) throw error;

      setDerivatives(prev =>
        prev.filter(d => d.id !== selectedDerivativeForModal.id)
      );

      setModalOpen(false);
      setSelectedDerivativeForModal(null);

      toast({
        title: "Derivative archived",
        description: "The derivative has been archived.",
      });
    } catch (error: any) {
      toast({
        title: "Error archiving derivative",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteDerivative = async () => {
    if (!selectedDerivativeForModal) return;

    if (!confirm('Are you sure you want to delete this derivative? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('derivative_assets')
        .delete()
        .eq('id', selectedDerivativeForModal.id);

      if (error) throw error;

      setDerivatives(prev =>
        prev.filter(d => d.id !== selectedDerivativeForModal.id)
      );

      setModalOpen(false);
      setSelectedDerivativeForModal(null);

      toast({
        title: "Derivative deleted",
        description: "The derivative has been permanently deleted.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting derivative",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDirector = (derivative: DerivativeContent) => {
    setSelectedDerivativeForDirector(derivative);
    setSplitScreenMode(true);
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied to clipboard",
      description: "Content copied successfully",
    });
  };

  const handleSaveToLibrary = () => {
    setSaveTitle(selectedMaster!.title);
    setSaveDialogOpen(true);
  };

  const saveToLibrary = async () => {
    if (!selectedMaster || saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setIsSavingMaster(true);

    try {
      const { error } = await supabase
        .from('master_content')
        .update({ title: saveTitle })
        .eq('id', selectedMaster.id);

      if (error) throw error;

      toast({
        title: "Saved to library",
        description: "Master content has been updated",
      });

      setSaveDialogOpen(false);
      setSelectedMaster({ ...selectedMaster, title: saveTitle });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSavingMaster(false);
      saveInFlightRef.current = false;
    }
  };

  const saveDerivativeToDatabase = async () => {
    if (!derivativeToSave || saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setIsSavingDerivative(true);

    try {
      const { error } = await supabase
        .from('derivative_assets')
        .update({
          platform_specs: {
            ...derivativeToSave.platformSpecs,
            title: derivativeSaveTitle
          }
        })
        .eq('id', derivativeToSave.id);

      if (error) throw error;

      toast({
        title: "Derivative saved",
        description: "Derivative has been updated",
      });

      setDerivativeSaveDialogOpen(false);
      setDerivativeToSave(null);
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSavingDerivative(false);
      saveInFlightRef.current = false;
    }
  };

  // Filter derivatives by selected master content ID
  const filteredDerivatives = derivatives.filter(d => (
    !selectedMaster?.id || d.master_content_id === selectedMaster.id
  ));

  const derivativesByType = filteredDerivatives.reduce((acc, d) => {
    if (!acc[d.typeId]) acc[d.typeId] = [];
    acc[d.typeId].push(d);
    return acc;
  }, {} as Record<string, DerivativeContent[]>);

  if (splitScreenMode && selectedDerivativeForDirector) {
    return (
      <EditorialDirectorSplitScreen
        derivative={selectedDerivativeForDirector}
        derivatives={derivatives}
        onClose={() => {
          setSplitScreenMode(false);
          setSelectedDerivativeForDirector(null);
        }}
        onUpdateDerivative={(updated) => {
          setDerivatives(derivatives.map(d =>
            d.id === updated.id ? updated : d
          ));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          {selectedMaster && selectedViaNavigationRef.current && (
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigate('/editor', {
                    state: {
                      contentId: selectedMaster.id,
                      content: selectedMaster.content,
                      contentName: selectedMaster.title,
                      contentType: selectedMaster.contentType,
                      collection: selectedMaster.collection
                    }
                  });
                }}
                className="text-aged-brass hover:text-aged-brass/80"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Editor
              </Button>
              <span className="text-sm text-muted-foreground">
                Editing: {selectedMaster.title}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-serif text-4xl">Multiply</h1>
            <VideoHelpTrigger videoId="what-is-multiply" variant="icon" />
            <LibrarianTrigger
              variant="icon"
              context="multiply"
              category="copy"
              onFrameworkSelect={(framework) => {
                toast({
                  title: "Framework acquired",
                  description: `"${framework.title}" - use this approach for your derivatives.`,
                });
              }}
            />
          </div>
          <p className="text-muted-foreground">Transform master content into multiple formats</p>
        </div>

        {/* Master Content Selector - Full Width */}
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium whitespace-nowrap">Master Content:</Label>
            {loadingContent ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Select value={selectedMaster?.id || ""} onValueChange={(id) => {
                const content = masterContentList.find(c => c.id === id);
                if (content) setSelectedMaster(content);
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select master content..." />
                </SelectTrigger>
                <SelectContent>
                  {masterContentList.map((content) => (
                    <SelectItem key={content.id} value={content.id}>
                      {content.title} ({content.wordCount} words)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Card>

        {/* Two-Column Resizable Layout */}
        <div className="hidden md:block">
          <ResizablePanelGroup direction="horizontal" className="min-h-[600px] rounded-lg border">
            {/* Left Panel - Master Content */}
            <ResizablePanel defaultSize={40} minSize={30}>
              <div className="h-full p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="space-y-1">
                    <h2 className="font-serif text-2xl">Master Content</h2>
                  </div>
                  {selectedMaster && (
                    <Button onClick={handleSaveToLibrary} disabled={isSavingMaster} size="sm" variant="outline" className="gap-2">
                      <Archive className="w-4 h-4" />
                      {isSavingMaster ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>

                {selectedMaster ? (
                  /* Phase 1: Use CollapsibleMasterContent for reduced cognitive load */
                  MULTIPLY_FEATURE_FLAGS.COLLAPSED_MASTER_CONTENT ? (
                    <CollapsibleMasterContent
                      content={{
                        id: selectedMaster.id,
                        title: selectedMaster.title,
                        contentType: selectedMaster.contentType,
                        collection: selectedMaster.collection,
                        content: selectedMaster.content,
                        wordCount: selectedMaster.wordCount,
                        charCount: selectedMaster.charCount,
                      }}
                      defaultExpanded={false}
                    />
                  ) : (
                    /* Original verbose panel */
                    <Card className="flex-1 overflow-hidden flex flex-col">
                      <div className="p-4 border-b space-y-2">
                        <h3 className="font-semibold text-lg">{selectedMaster.title}</h3>
                        <div className="flex gap-2">
                          {selectedMaster.contentType && (
                            <Badge variant="secondary">{selectedMaster.contentType}</Badge>
                          )}
                          {selectedMaster.collection && (
                            <Badge variant="outline">{selectedMaster.collection}</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>{selectedMaster.wordCount} words</span>
                          <span>{selectedMaster.charCount} characters</span>
                        </div>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-4">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedMaster.content}</p>
                        </div>
                      </ScrollArea>
                    </Card>
                  )
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Select master content from dropdown above</p>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel - Derivative Selection & Results */}
            <ResizablePanel defaultSize={60} minSize={40}>
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-2xl">Derivative Editions</h2>
                    <VideoHelpTrigger videoId="understanding-derivatives" variant="icon" />
                  </div>

                  {/* Phase 3: Madison's Suggestion Card - AI-guided one-click path */}
                  {MULTIPLY_FEATURE_FLAGS.MADISON_SUGGESTIONS && selectedMaster && derivatives.length === 0 && (
                    <MadisonSuggestionCard
                      contentTitle={selectedMaster.title}
                      contentType={selectedMaster.contentType}
                      suggestions={[]} // Will use default suggestions based on content type
                      onUseSuggestions={(typeIds) => {
                        // Auto-select the suggested types
                        const newSelected = new Set(typeIds);
                        setSelectedTypes(newSelected);
                      }}
                    />
                  )}

                  {/* Generated Derivatives - Show Above Selector */}
                  {Object.keys(derivativesByType).length > 0 && (
                    <div className="space-y-4 pt-6 border-t">
                      <h3 className="font-serif text-xl">Generated Derivatives</h3>
                      <div className="space-y-4">
                        {Object.entries(derivativesByType).map(([typeId, derivs]) => {
                          const type = DERIVATIVE_TYPES.find(t => t.id === typeId);
                          if (!type) return null;

                          const Icon = type.icon;
                          const isExpanded = expandedTypes.has(typeId);

                          return (
                            <div key={typeId} className="border rounded-lg overflow-hidden">
                              <button
                                onClick={() => toggleExpanded(typeId)}
                                className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  {type.iconImage ? (
                                    <img src={type.iconImage} alt={type.name} className="w-6 h-6" />
                                  ) : Icon ? (
                                    <Icon className="w-6 h-6" style={{ color: type.iconColor }} />
                                  ) : null}
                                  <div className="text-left">
                                    <h3 className="font-medium">{type.name}</h3>
                                    <p className="text-sm text-muted-foreground">{derivs.length} generated</p>
                                  </div>
                                </div>
                                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                              </button>

                              {isExpanded && (
                                <div className="p-4 space-y-3 bg-muted/20">
                                  {derivs.map((deriv) => (
                                    <Card key={deriv.id} className="p-4">
                                      <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <Badge variant={deriv.status === "approved" ? "default" : deriv.status === "rejected" ? "destructive" : "secondary"}>
                                            {deriv.status === "approved" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                            {deriv.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                                            {deriv.status}
                                          </Badge>
                                          <span className="text-sm text-muted-foreground">
                                            {deriv.charCount} chars
                                            {type.charLimit && ` / ${type.charLimit}`}
                                          </span>
                                        </div>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleOpenModal(deriv)}
                                            title="View full details"
                                          >
                                            <FileText className="w-4 h-4" />
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(deriv.content)}>
                                            <Copy className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openDirector(deriv)}
                                            title="Open AI Director"
                                          >
                                            <Edit className="w-4 h-4" />
                                          </Button>
                                          <ScheduleButton
                                            contentTitle={type.name}
                                            contentType={deriv.asset_type || type.id}
                                            variant="ghost"
                                            size="sm"
                                            derivativeAsset={{
                                              id: deriv.id,
                                              master_content_id: selectedMaster?.id || '',
                                              asset_type: deriv.asset_type || type.id,
                                              generated_content: deriv.generated_content || deriv.content,
                                              platform_specs: deriv.platformSpecs || {}
                                            }}
                                            masterContent={selectedMaster ? {
                                              id: selectedMaster.id,
                                              title: selectedMaster.title,
                                              content_type: selectedMaster.contentType
                                            } : undefined}
                                          />
                                          <Button variant="ghost" size="sm" onClick={() => {
                                            setDerivativeToSave(deriv);
                                            setDerivativeSaveTitle(type.name);
                                            setDerivativeSaveDialogOpen(true);
                                          }}>
                                            <Archive className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </div>
                                      {deriv.isSequence && deriv.sequenceEmails ? (
                                        <div className="space-y-2">
                                          {deriv.sequenceEmails.map((email) => (
                                            <div key={email.id} className="p-3 bg-background rounded border">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline">Email {email.sequenceNumber}</Badge>
                                                <span className="text-sm font-medium">{email.subject}</span>
                                              </div>
                                              <p className="text-sm text-muted-foreground line-clamp-2">{email.content}</p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm whitespace-pre-wrap line-clamp-4">{deriv.content}</p>
                                      )}
                                    </Card>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Derivative Type Selector - Below Generated Results */}
                  <div className="space-y-4">
                    <Separator />

                    <div className="flex items-center gap-3">
                      <h3 className="font-serif text-xl">
                        {Object.keys(derivativesByType).length > 0 ? "Generate More Derivatives" : "Select Derivative Types"}
                      </h3>
                      <VideoHelpTrigger videoId="understanding-derivatives" variant="icon" />
                    </div>

                    {Object.keys(derivativesByType).length === 0 && (
                      <div className="text-center py-8">
                        <img src={fannedPagesImage} alt="No derivatives" className="w-20 h-20 mx-auto mb-4 opacity-50" />
                        <h3 className="font-medium text-lg mb-2">No Derivatives Yet</h3>
                        <p className="text-sm text-muted-foreground">Generate channel-specific versions of your master content</p>
                      </div>
                    )}

                    {/* Derivative Type Selector - Feature Flag Toggle */}
                    {useOldSelector ? (
                      /* OLD CODE - Keep for safety */
                      <div className="space-y-4">
                        <h3 className="font-medium">Select derivative types to generate:</h3>

                        {/* Most Popular */}
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-3">MOST POPULAR</p>
                          <div className="grid grid-cols-3 gap-3">
                            {TOP_DERIVATIVE_TYPES.map((type) => (
                              <Card
                                key={type.id}
                                onClick={() => toggleTypeSelection(type.id)}
                                className={`p-4 cursor-pointer transition-all hover:shadow-md ${selectedTypes.has(type.id) ? "ring-2 ring-brass bg-brass/5" : ""}`}
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between">
                                    <Checkbox checked={selectedTypes.has(type.id)} className="mt-1" />
                                    {type.iconImage ? (
                                      <img src={type.iconImage} alt={type.name} className="w-8 h-8" />
                                    ) : type.icon && (
                                      <type.icon className="w-8 h-8" style={{ color: type.iconColor }} />
                                    )}
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-sm">{type.name}</h4>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{type.description}</p>
                                    {type.charLimit && (
                                      <p className="text-xs text-muted-foreground mt-1">Max: {type.charLimit} chars</p>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>

                        {/* More Options - Collapsible */}
                        <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions}>
                          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                            {showMoreOptions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            MORE OPTIONS
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <div className="grid grid-cols-3 gap-3">
                              {ADDITIONAL_DERIVATIVE_TYPES.map((type) => (
                                <Card
                                  key={type.id}
                                  onClick={() => toggleTypeSelection(type.id)}
                                  className={`p-4 cursor-pointer transition-all hover:shadow-md ${selectedTypes.has(type.id) ? "ring-2 ring-brass bg-brass/5" : ""}`}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between">
                                      <Checkbox checked={selectedTypes.has(type.id)} className="mt-1" />
                                      {type.iconImage ? (
                                        <img src={type.iconImage} alt={type.name} className="w-8 h-8" />
                                      ) : type.icon && (
                                        <type.icon className="w-8 h-8" style={{ color: type.iconColor }} />
                                      )}
                                    </div>
                                    <div>
                                      <h4 className="font-medium text-sm">{type.name}</h4>
                                      <p className="text-xs text-muted-foreground line-clamp-2">{type.description}</p>
                                      {type.charLimit && (
                                        <p className="text-xs text-muted-foreground mt-1">Max: {type.charLimit} chars</p>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-4">
                          <Button variant="outline" size="sm" onClick={selectAll}>
                            Select All
                          </Button>
                          <Button
                            onClick={generateDerivatives}
                            disabled={isGenerating || selectedTypes.size === 0}
                            size="lg"
                            className="gap-2"
                          >
                            {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                            {isGenerating ? "Generating..." : `Generate ${selectedTypes.size} Derivative${selectedTypes.size !== 1 ? "s" : ""}`}
                          </Button>
                        </div>
                      </div>
                    ) : MULTIPLY_FEATURE_FLAGS.CATEGORY_ACCORDION ? (
                      /* Phase 2: Category-based accordion grouping */
                      <div className="space-y-4">
                        <DerivativeCategoryAccordion
                          allTypes={[...TOP_DERIVATIVE_TYPES, ...ADDITIONAL_DERIVATIVE_TYPES]}
                          selectedTypes={selectedTypes}
                          onToggleType={toggleTypeSelection}
                        />

                        {/* Quick actions below accordion - hidden when unified button is enabled */}
                        {!MULTIPLY_FEATURE_FLAGS.UNIFIED_GENERATE_BUTTON && (
                          <div className="flex items-center justify-between pt-4">
                            <Button variant="outline" size="sm" onClick={selectAll}>
                              Select All
                            </Button>
                            <Button
                              onClick={generateDerivatives}
                              disabled={isGenerating || selectedTypes.size === 0}
                              size="lg"
                              className="gap-2"
                            >
                              {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                              {isGenerating ? "Generating..." : `Generate ${selectedTypes.size} Derivative${selectedTypes.size !== 1 ? "s" : ""}`}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Original DerivativeTypeSelector component */
                      <DerivativeTypeSelector
                        topTypes={TOP_DERIVATIVE_TYPES}
                        additionalTypes={ADDITIONAL_DERIVATIVE_TYPES}
                        selectedTypes={selectedTypes}
                        onToggleType={toggleTypeSelection}
                        onSelectAll={selectAll}
                        onGenerate={generateDerivatives}
                        isGenerating={isGenerating}
                        showMoreOptions={showMoreOptions}
                        onToggleMoreOptions={setShowMoreOptions}
                      />
                    )}

                    {/* Visual Prompts Section - Phase 1: Use collapsible toggle */}
                    <div className="mt-8 pt-8 border-t border-border/40">
                      {MULTIPLY_FEATURE_FLAGS.VISUAL_PROMPTS_TOGGLE ? (
                        <VisualPromptsToggle
                          selectedTypes={selectedVisualTypes}
                          onToggleType={toggleVisualType}
                        />
                      ) : (
                        /* Original Visual Prompts section */
                        <>
                          <h3 className="font-serif text-xl mb-4">Visual Prompts</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Generate image, video, and background prompts from your content
                          </p>

                          <div className="grid grid-cols-3 gap-3 mb-4">
                            {VISUAL_DERIVATIVE_TYPES.map((type) => (
                              <Card
                                key={type.id}
                                onClick={() => toggleVisualType(type.id)}
                                className={`p-4 cursor-pointer transition-all hover:shadow-md ${selectedVisualTypes.has(type.id) ? "ring-2 ring-primary bg-primary/5" : ""}`}
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between">
                                    <Checkbox checked={selectedVisualTypes.has(type.id)} className="mt-1" />
                                    {type.iconImage ? (
                                      <img src={type.iconImage} alt={type.name} className="w-8 h-8" />
                                    ) : type.icon && (
                                      <type.icon className="w-8 h-8" style={{ color: type.iconColor }} />
                                    )}
                                  </div>
                                  <div>
                                    <h4 className="font-medium">{type.name}</h4>
                                    <p className="text-xs text-muted-foreground">{type.description}</p>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>

                          <Button
                            onClick={generateVisualPrompts}
                            disabled={isGeneratingVisual || selectedVisualTypes.size === 0 || (!selectedMaster && !userContent)}
                            size="lg"
                            className="w-full gap-2"
                          >
                            {isGeneratingVisual ? <Loader2 className="animate-spin" /> : <Sparkles />}
                            {isGeneratingVisual ? "Generating..." : `Generate ${selectedVisualTypes.size} Visual Pack${selectedVisualTypes.size !== 1 ? "s" : ""}`}
                          </Button>
                        </>
                      )}

                      {/* Visual Prompt Results */}
                      {imagePackResult && (
                        <div className="mt-6">
                          <h4 className="font-medium mb-3">Image Pack</h4>
                          <ImagePackResults
                            images={imagePackResult.images}
                            analysis={imagePackResult.analysis}
                          />
                        </div>
                      )}

                      {videoScriptResult && (
                        <div className="mt-6">
                          <h4 className="font-medium mb-3">Video Scripts</h4>
                          <VideoScriptResults
                            videos={videoScriptResult.videos}
                            analysis={videoScriptResult.analysis}
                          />
                        </div>
                      )}

                      {productBgResult && (
                        <div className="mt-6">
                          <h4 className="font-medium mb-3">Product Backgrounds</h4>
                          <ProductBackgroundResults
                            backgrounds={productBgResult.backgrounds}
                            analysis={productBgResult.analysis}
                          />
                        </div>
                      )}
                    </div>

                    {/* Phase 1: Unified Generate Button */}
                    {MULTIPLY_FEATURE_FLAGS.UNIFIED_GENERATE_BUTTON && (
                      <div className="mt-8 pt-6 border-t flex justify-center">
                        <UnifiedGenerateButton
                          selectedContentCount={selectedTypes.size}
                          selectedVisualCount={selectedVisualTypes.size}
                          isGenerating={isGenerating || isGeneratingVisual}
                          onGenerate={async () => {
                            // Generate content derivatives first
                            if (selectedTypes.size > 0) {
                              await generateDerivatives();
                            }
                            // Then generate visual prompts
                            if (selectedVisualTypes.size > 0) {
                              await generateVisualPrompts();
                            }
                          }}
                          data-generate-button
                        />
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Mobile/Tablet Vertical Layout */}
        <div className="md:hidden space-y-6">
          {/* Master Content */}
          {selectedMaster && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl">Master Content</h2>
                <Button onClick={handleSaveToLibrary} disabled={isSavingMaster} size="sm" variant="outline">
                  <Archive className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">{selectedMaster.title}</h3>
                <div className="flex gap-2 flex-wrap">
                  {selectedMaster.contentType && <Badge variant="secondary">{selectedMaster.contentType}</Badge>}
                  {selectedMaster.collection && <Badge variant="outline">{selectedMaster.collection}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{selectedMaster.wordCount} words · {selectedMaster.charCount} characters</p>
                <p className="text-sm line-clamp-6">{selectedMaster.content}</p>
              </div>
            </Card>
          )}

          {/* Derivative Selector & Results - Mobile */}
          <Card className="p-4 space-y-4">
            <h2 className="font-serif text-xl">Derivative Editions</h2>

            <div className="space-y-3">
              <p className="text-sm font-medium">MOST POPULAR</p>
              <div className="grid grid-cols-1 gap-3">
                {TOP_DERIVATIVE_TYPES.map((type) => (
                  <Card
                    key={type.id}
                    onClick={() => toggleTypeSelection(type.id)}
                    className={`p-3 cursor-pointer transition-all hover:bg-brass/5 ${selectedTypes.has(type.id) ? "ring-2 ring-brass bg-brass/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selectedTypes.has(type.id)} className="mt-1" />
                      {type.iconImage ? (
                        <img src={type.iconImage} alt={type.name} className="w-8 h-8 shrink-0" />
                      ) : type.icon && (
                        <type.icon className="w-8 h-8 shrink-0" style={{ color: type.iconColor }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{type.name}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">{type.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                {showMoreOptions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                MORE OPTIONS
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="grid grid-cols-1 gap-3">
                  {ADDITIONAL_DERIVATIVE_TYPES.map((type) => (
                    <Card
                      key={type.id}
                      onClick={() => toggleTypeSelection(type.id)}
                      className={`p-3 cursor-pointer transition-all hover:bg-brass/5 ${selectedTypes.has(type.id) ? "ring-2 ring-brass bg-brass/5" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox checked={selectedTypes.has(type.id)} className="mt-1" />
                        {type.iconImage ? (
                          <img src={type.iconImage} alt={type.name} className="w-8 h-8 shrink-0" />
                        ) : type.icon && (
                          <type.icon className="w-8 h-8 shrink-0" style={{ color: type.iconColor }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm">{type.name}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">{type.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={selectAll} className="w-full">Select All</Button>
              <Button
                onClick={generateDerivatives}
                disabled={isGenerating || selectedTypes.size === 0}
                className="gap-2 w-full"
              >
                {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {isGenerating ? "Generating..." : `Generate ${selectedTypes.size} Derivative${selectedTypes.size !== 1 ? "s" : ""}`}
              </Button>
            </div>

            {/* Mobile Results */}
            {Object.keys(derivativesByType).length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-medium">Generated Derivatives</h3>
                {Object.entries(derivativesByType).map(([typeId, derivs]) => {
                  const type = DERIVATIVE_TYPES.find(t => t.id === typeId);
                  if (!type) return null;
                  const isExpanded = expandedTypes.has(typeId);
                  return (
                    <div key={typeId} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleExpanded(typeId)}
                        className="w-full p-3 flex items-center justify-between hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          {type.iconImage ? (
                            <img src={type.iconImage} alt={type.name} className="w-5 h-5" />
                          ) : type.icon && (
                            <type.icon className="w-5 h-5" style={{ color: type.iconColor }} />
                          )}
                          <div className="text-left">
                            <p className="font-medium text-sm">{type.name}</p>
                            <p className="text-xs text-muted-foreground">{derivs.length} generated</p>
                          </div>
                        </div>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      {isExpanded && (
                        <div className="p-3 space-y-2 bg-muted/20">
                          {derivs.map((deriv) => (
                            <Card key={deriv.id} className="p-3">
                              <div className="flex justify-between mb-2">
                                <Badge variant="secondary" className="text-xs">{deriv.status}</Badge>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenModal(deriv)}
                                  >
                                    <FileText className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(deriv.content)}>
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openDirector(deriv)}>
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs line-clamp-3">{deriv.content}</p>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Save Master Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save to Library</DialogTitle>
            <DialogDescription>Update the title for this master content</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveToLibrary} disabled={isSavingMaster}>
                {isSavingMaster ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Derivative Dialog */}
      <Dialog open={derivativeSaveDialogOpen} onOpenChange={setDerivativeSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Derivative</DialogTitle>
            <DialogDescription>Update the title for this derivative</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={derivativeSaveTitle} onChange={(e) => setDerivativeSaveTitle(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDerivativeSaveDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveDerivativeToDatabase} disabled={isSavingDerivative}>
                {isSavingDerivative ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Derivative Detail Modal */}
      <DerivativeFullModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        derivative={selectedDerivativeForModal ? {
          id: selectedDerivativeForModal.id,
          asset_type: selectedDerivativeForModal.asset_type || selectedDerivativeForModal.typeId,
          generated_content: selectedDerivativeForModal.generated_content || selectedDerivativeForModal.content,
          approval_status: selectedDerivativeForModal.status,
          platform_specs: selectedDerivativeForModal.platformSpecs,
        } : null}
        label={selectedDerivativeForModal ?
          DERIVATIVE_TYPES.find(t => t.id === selectedDerivativeForModal.typeId)?.name || ''
          : ''}
        onApprove={handleApproveDerivative}
        onReject={handleRejectDerivative}
        onEdit={handleSaveEdit}
        onCopy={() => selectedDerivativeForModal && copyToClipboard(selectedDerivativeForModal.content)}
        onSchedule={handleScheduleDerivative}
        onApproveAndSchedule={handleScheduleDerivative}
        onArchive={handleArchiveDerivative}
        onDelete={handleDeleteDerivative}
      />
    </div>
  );
}
