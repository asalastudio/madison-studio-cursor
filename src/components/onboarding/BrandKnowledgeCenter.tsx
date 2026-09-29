import { useState, useCallback, useEffect } from "react";
import { Upload, Link as LinkIcon, FileText, Loader2, CheckCircle2, AlertCircle, FileUp, X, Download, Trash2, Zap, ArrowRight, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { logger } from "@/lib/logger";

interface BrandKnowledgeCenterProps {
  organizationId: string;
}

interface UploadedDocument {
  id: string;
  file_name: string;
  file_size: number;
  created_at: string;
  processing_status: string;
  file_url: string;
}

export function BrandKnowledgeCenter({ organizationId }: BrandKnowledgeCenterProps) {
  const { toast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<"upload" | "url" | "manual" | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [showQuickStart, setShowQuickStart] = useState(true);
  
  // Uploaded documents state
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  // Brand knowledge state (extracted insights)
  const [brandKnowledge, setBrandKnowledge] = useState<Array<{
    id: string;
    knowledge_type: string;
    content: any;
    created_at: string;
  }>>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);

  // Auto-select upload method when files are staged
  useEffect(() => {
    if (stagedFiles.length > 0 && !selectedMethod) {
      setSelectedMethod("upload");
    }
  }, [stagedFiles.length, selectedMethod]);

  // Fetch uploaded documents and brand knowledge
  useEffect(() => {
    fetchUploadedDocuments();
    fetchBrandKnowledge();
  }, [organizationId]);

  const fetchBrandKnowledge = async () => {
    setLoadingKnowledge(true);
    try {
      const { data, error } = await supabase
        .from("brand_knowledge")
        .select("id, knowledge_type, content, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBrandKnowledge(data || []);
      logger.debug("🧠 Fetched brand knowledge:", data?.length || 0);
    } catch (error: any) {
      logger.error("Error fetching brand knowledge:", error);
    } finally {
      setLoadingKnowledge(false);
    }
  };

  const handleDeleteKnowledge = async (id: string, type: string) => {
    if (!confirm(`Delete this ${type.replace(/_/g, ' ')} entry? This cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from("brand_knowledge")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ 
        title: "Knowledge Deleted", 
        description: "Brand knowledge entry removed successfully" 
      });
      await fetchBrandKnowledge();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleClearAllKnowledge = async () => {
    if (!confirm("⚠️ Delete ALL brand knowledge for this organization? This includes all website scans, manual entries, and document extractions. This cannot be undone.")) return;

    try {
      const { error } = await supabase
        .from("brand_knowledge")
        .delete()
        .eq("organization_id", organizationId);

      if (error) throw error;

      toast({ 
        title: "All Knowledge Cleared", 
        description: "All brand knowledge has been deleted. You can now start fresh." 
      });
      await fetchBrandKnowledge();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  // Auto-hide Quick Start when documents exist
  useEffect(() => {
    if (uploadedDocuments.length > 0) {
      setShowQuickStart(false);
    }
  }, [uploadedDocuments]);

  // Auto-poll for status updates when documents are pending/processing
  useEffect(() => {
    const hasPendingDocs = uploadedDocuments.some(
      doc => doc.processing_status === 'pending' || doc.processing_status === 'processing'
    );

    if (!hasPendingDocs) return;

    // Poll every 3 seconds while there are pending documents
    const pollInterval = setInterval(() => {
      logger.debug('🔄 Polling for document status updates...');
      fetchUploadedDocuments();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [uploadedDocuments, organizationId]);

  const fetchUploadedDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const { data, error } = await supabase
        .from("brand_documents")
        .select("id, file_name, file_size, created_at, processing_status, file_url")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUploadedDocuments(data || []);
      logger.debug("📄 Fetched documents:", data?.length || 0);
    } catch (error: any) {
      logger.error("Error fetching documents:", error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const handleUrlScrape = async () => {
    if (!websiteUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a valid website URL to scan.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setUploadStatus("processing");

    try {
      // Delete old website_scrape entries first to avoid accumulation
      const { error: deleteError } = await supabase
        .from("brand_knowledge")
        .delete()
        .eq("organization_id", organizationId)
        .eq("knowledge_type", "website_scrape");
      
      if (deleteError) {
        logger.warn("Could not delete old website scans:", deleteError);
        // Continue anyway - new data will just be added
      }

      const { data, error } = await supabase.functions.invoke("scrape-brand-website", {
        body: { url: websiteUrl, organizationId },
      });

      if (error) throw error;

      if (data?.success) {
        setUploadStatus("success");
        toast({
          title: "Website Scanned",
          description: "Brand voice and tone extracted successfully! Previous website scan data was replaced.",
        });
        setWebsiteUrl("");
        await fetchBrandKnowledge(); // Refresh the knowledge list
      }
    } catch (error: any) {
      logger.error("Error scraping website:", error);
      setUploadStatus("error");
      
      // Extract error message from edge function response
      let errorMessage = "Failed to extract brand information.";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.context?.body) {
        try {
          const body = JSON.parse(error.context.body);
          errorMessage = body.error || errorMessage;
        } catch {
          // Ignore parse errors
        }
      }
      
      toast({
        title: "Scraping Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualVoice = async () => {
    if (!brandVoice.trim()) {
      toast({
        title: "Description Required",
        description: "Please describe your brand voice.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Delete old manual voice entries first to avoid accumulation
      const { error: deleteError } = await supabase
        .from("brand_knowledge")
        .delete()
        .eq("organization_id", organizationId)
        .eq("knowledge_type", "voice_manual");
      
      if (deleteError) {
        logger.warn("Could not delete old voice entries:", deleteError);
      }

      const { error } = await supabase.from("brand_knowledge").insert({
        organization_id: organizationId,
        knowledge_type: "voice_manual",
        content: { description: brandVoice },
      });

      if (error) throw error;

      toast({
        title: "Brand Voice Saved",
        description: "Your brand voice description has been stored (previous manual entries replaced).",
      });
      
      setBrandVoice("");
      await fetchBrandKnowledge(); // Refresh the knowledge list
    } catch (error) {
      logger.error("Error saving brand voice:", error);
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save brand voice.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFilesAdded = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const supportedFiles = fileArray.filter(file => {
      // Check by MIME type
      const validMimeType = file.type === 'application/pdf' || file.type.startsWith('text/');
      // Check by file extension (some systems don't set MIME type correctly)
      const validExtension = /\.(txt|md|markdown|pdf)$/i.test(file.name);
      return validMimeType || validExtension;
    });

    if (supportedFiles.length === 0) {
      toast({
        title: "Unsupported File Type",
        description: "Please upload PDF, TXT, or Markdown (.md) files. Text files are recommended for best accuracy.",
        variant: "destructive",
      });
      return;
    }

    // Check if PDFs were added and show helpful guidance
    const hasPdfs = supportedFiles.some(f => f.type === 'application/pdf');
    if (hasPdfs) {
      toast({
        title: "PDF Upload Tips",
        description: "For best results, ensure your PDF has selectable text. If text can't be selected, use the Manual method instead.",
        duration: 6000,
      });
    }

    // Add new files to staging area, avoiding duplicates
    setStagedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      const newFiles = supportedFiles.filter(f => !existingNames.has(f.name));
      
      if (newFiles.length < supportedFiles.length) {
        toast({
          title: "Duplicate Files Skipped",
          description: "Some files were already added.",
        });
      }
      
      logger.debug("📎 Files staged:", [...prev, ...newFiles].map(f => f.name));
      return [...prev, ...newFiles];
    });
  };

  const removeFileFromStaging = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadStagedFiles = async () => {
    if (stagedFiles.length === 0) return;

    setIsProcessing(true);
    setUploadStatus("processing");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      for (const file of stagedFiles) {
        // Generate unique file path
        const timestamp = Date.now();
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${organizationId}/${timestamp}_${sanitizedFileName}`;

        // Upload file to storage
        const { error: uploadError } = await supabase.storage
          .from('brand-documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          logger.error('Storage upload error:', uploadError);
          throw uploadError;
        }

        // Insert document record with file URL
        const { data: docData, error: insertError } = await supabase
          .from('brand_documents')
          .insert({
            organization_id: organizationId,
            uploaded_by: user.id,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            file_url: filePath,
            processing_status: 'pending',
          })
          .select()
          .single();

        if (insertError) {
          logger.error('Database insert error:', insertError);
          throw insertError;
        }

        // Trigger document processing in background (fire-and-forget)
        // Don't await - processing happens asynchronously and we don't want to block
        if (docData) {
          // Fire and forget - don't await to avoid blocking or triggering auth checks
          supabase.functions.invoke('process-brand-document', {
            body: { documentId: docData.id }
          }).then(({ error: invokeError }) => {
            if (invokeError) {
              logger.error('Edge function invocation failed:', invokeError);
              
              // Mark as failed in background - don't block user
              supabase
                .from('brand_documents')
                .update({ 
                  processing_status: 'failed',
                  content_preview: `Invocation error: ${invokeError.message}`
                })
                .eq('id', docData.id)
                .then(() => {
                  // Only show toast if user is still on the page
                  toast({
                    title: "Processing Failed",
                    description: `Failed to start processing ${file.name}. You can retry from the document list.`,
                    variant: "destructive"
                  });
                })
                .catch((updateError) => {
                  logger.error('Failed to update document status:', updateError);
                });
            } else {
              logger.debug('Processing started for', file.name);
            }
          }).catch((invokeError) => {
            // Catch any unexpected errors in the invocation
            logger.error('Unexpected error invoking function:', invokeError);
            // Don't show error to user - processing might still succeed
            // The document will show as "pending" and can be retried if needed
          });
        }
      }

      setUploadStatus("success");
      toast({
        title: "Documents Uploaded",
        description: `Successfully uploaded ${stagedFiles.length} document${stagedFiles.length > 1 ? 's' : ''}.`,
      });

      logger.debug("✅ Documents uploaded successfully:", stagedFiles.map(f => f.name));
      
      // Clear staging area and refresh list
      setStagedFiles([]);
      await fetchUploadedDocuments();
    } catch (error) {
      logger.error("Error uploading documents:", error);
      setUploadStatus("error");
      
      // Extract user-friendly error message
      let errorMessage = "Failed to upload documents.";
      if (error instanceof Error) {
        errorMessage = error.message;
        // Don't show technical auth errors to user
        if (error.message.includes('JWT') || error.message.includes('token') || error.message.includes('authentication')) {
          errorMessage = "Authentication error. Please refresh the page and try again.";
        }
      }
      
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Don't throw or navigate - just show error and let user retry
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadDocument = async (doc: UploadedDocument) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.storage
        .from("brand-documents")
        .createSignedUrl(doc.file_url, 60);

      if (error) throw error;
      
      window.open(data.signedUrl, '_blank');
      toast({ title: "Success", description: "Document opened in new tab" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRetryProcessing = async (doc: UploadedDocument) => {
    try {
      setIsProcessing(true);
      
      // Update status to processing
      await supabase
        .from('brand_documents')
        .update({ processing_status: 'processing' })
        .eq('id', doc.id);

      // Trigger processing
      const { error } = await supabase.functions.invoke('process-brand-document', {
        body: { documentId: doc.id }
      });

      if (error) throw error;

      toast({
        title: "Processing Started",
        description: `Retrying processing for "${doc.file_name}"`,
      });

      // Refresh after a short delay
      setTimeout(() => {
        fetchUploadedDocuments();
      }, 2000);
    } catch (error: any) {
      logger.error('Retry error:', error);
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to retry processing",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteDocument = async (doc: UploadedDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return;
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("brand-documents")
        .remove([doc.file_url]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("brand_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      toast({ title: "Success", description: "Document deleted successfully" });
      await fetchUploadedDocuments();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFilesAdded(files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(e.target.files);
    }
  };

  const handleQuickStart = () => {
    setShowQuickStart(false);
    setSelectedMethod("upload");
  };

  const handleSkipForNow = () => {
    toast({
      title: "No problem!",
      description: "You can add brand documents anytime from Settings.",
    });
  };

  return (
    <Card className="border-border/20 shadow-level-2 hover:shadow-level-3 transition-shadow">
      <CardHeader>
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <FileText className="h-5 w-5 text-brass" />
          Brand Knowledge Center
        </CardTitle>
        <CardDescription className="text-charcoal/70">
          Train the AI to understand your brand's unique voice and style
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-brass text-parchment flex items-center justify-center font-serif text-sm shadow-level-1">
              1
            </div>
            <span className="text-xs text-charcoal font-medium hidden sm:inline">Choose Method</span>
          </div>
          <div className={`h-[2px] w-12 transition-colors ${selectedMethod ? 'bg-brass' : 'bg-charcoal/20'}`} />
          <div className="flex items-center gap-2">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center font-serif text-sm transition-all ${
              selectedMethod 
                ? 'bg-brass text-parchment shadow-level-1' 
                : 'border-2 border-charcoal/30 text-charcoal/50'
            }`}>
              2
            </div>
            <span className={`text-xs font-medium hidden sm:inline transition-colors ${
              selectedMethod ? 'text-charcoal' : 'text-charcoal/50'
            }`}>Add Content</span>
          </div>
          <div className={`h-[2px] w-12 transition-colors ${uploadStatus === 'success' ? 'bg-brass' : 'bg-charcoal/20'}`} />
          <div className="flex items-center gap-2">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center font-serif text-sm transition-all ${
              uploadStatus === 'success'
                ? 'bg-brass text-parchment shadow-level-1'
                : 'border-2 border-charcoal/30 text-charcoal/50'
            }`}>
              3
            </div>
            <span className={`text-xs font-medium hidden sm:inline transition-colors ${
              uploadStatus === 'success' ? 'text-charcoal' : 'text-charcoal/50'
            }`}>Complete</span>
          </div>
        </div>

        {/* Quick Start Option */}
        {showQuickStart && !selectedMethod && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="mb-6 bg-gradient-to-br from-brass/5 to-transparent border-2 border-brass/30 shadow-level-1 hover:shadow-level-2 transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-brass text-parchment flex items-center justify-center flex-shrink-0">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-serif text-lg text-ink mb-1">Quick Start (30 seconds)</h3>
                    <p className="text-sm text-charcoal/70 mb-4">Drop one document and you're done — the fastest way to get started</p>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleQuickStart}
                        className="bg-brass text-ink hover:bg-antique-gold shadow-level-1 hover:shadow-level-2 hover:-translate-y-0.5 transition-all"
                      >
                        Start Now
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => setShowQuickStart(false)}
                        className="text-charcoal hover:text-ink"
                      >
                        See All Options
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Visual Card System - Reordered with Manual First */}
        {!selectedMethod && !showQuickStart && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Manual Entry Card - NOW FIRST */}
            <Card 
              onClick={() => setSelectedMethod("manual")}
              className="cursor-pointer border-2 border-transparent hover:border-brass transition-all duration-300 hover:shadow-level-3 group"
            >
              <CardContent className="p-8 text-center">
                <div className="mb-4 p-4 rounded-full bg-brass/10 w-16 h-16 mx-auto flex items-center justify-center group-hover:bg-brass/20 transition-colors">
                  <FileText className="h-8 w-8 text-brass" />
                </div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h3 className="font-serif text-xl text-ink">Manual Entry</h3>
                  <Sparkles className="h-4 w-4 text-brass" />
                </div>
                <p className="text-sm text-charcoal/70 mb-3">Most reliable method</p>
                <Badge className="bg-brass text-parchment-white border-brass">Most Reliable</Badge>
                
                {/* Contextual Info */}
                <div className="mt-4 p-4 bg-vellum/50 rounded-md border border-charcoal/10 text-left">
                  <p className="text-xs font-medium text-ink mb-2 flex items-center gap-2">
                    <span className="text-brass">✦</span> Copy-paste from PDFs:
                  </p>
                  <ul className="text-xs text-charcoal/70 space-y-1">
                    <li>• Always works (no upload issues)</li>
                    <li>• Paste text from any document</li>
                    <li>• Full control over content</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Upload PDFs Card */}
            <Card 
              onClick={() => setSelectedMethod("upload")}
              className="cursor-pointer border-2 border-transparent hover:border-brass transition-all duration-300 hover:shadow-level-3 group"
            >
              <CardContent className="p-8 text-center">
                <div className="mb-4 p-4 rounded-full bg-brass/10 w-16 h-16 mx-auto flex items-center justify-center group-hover:bg-brass/20 transition-colors">
                  <FileUp className="h-8 w-8 text-brass" />
                </div>
                <h3 className="font-serif text-xl text-ink mb-2">Upload Files</h3>
                <p className="text-sm text-charcoal/70 mb-3">For text-based PDFs</p>
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">✓ TXT</Badge>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">✓ MD</Badge>
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">⚠ PDF</Badge>
                </div>
                
                {/* Contextual Info */}
                <div className="mt-4 p-4 bg-yellow-50/50 rounded-md border border-yellow-200/50 text-left">
                  <p className="text-xs font-medium text-ink mb-2 flex items-center gap-2">
                    <span className="text-yellow-600">⚠</span> PDF Requirements:
                  </p>
                  <ul className="text-xs text-charcoal/70 space-y-1">
                    <li>• Must have selectable text</li>
                    <li>• Scanned images won't work</li>
                    <li>• Use Manual if PDF fails</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Website Scan Card */}
            <Card 
              onClick={() => setSelectedMethod("url")}
              className="cursor-pointer border-2 border-transparent hover:border-brass transition-all duration-300 hover:shadow-level-3 group"
            >
              <CardContent className="p-8 text-center">
                <div className="mb-4 p-4 rounded-full bg-brass/10 w-16 h-16 mx-auto flex items-center justify-center group-hover:bg-brass/20 transition-colors">
                  <LinkIcon className="h-8 w-8 text-brass" />
                </div>
                <h3 className="font-serif text-xl text-ink mb-2">Website Scan</h3>
                <p className="text-sm text-charcoal/70 mb-3">Fastest option</p>
                <Badge className="bg-brass/10 text-brass border-brass/30 hover:bg-brass/20">Quick</Badge>
                
                {/* Contextual Info */}
                <div className="mt-4 p-4 bg-vellum/50 rounded-md border border-charcoal/10 text-left">
                  <p className="text-xs font-medium text-ink mb-2 flex items-center gap-2">
                    <span className="text-brass">✦</span> We Extract:
                  </p>
                  <ul className="text-xs text-charcoal/70 space-y-1">
                    <li>• Voice & tone patterns</li>
                    <li>• Common vocabulary</li>
                    <li>• Writing style</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Upload Method Content */}
        {selectedMethod === "upload" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label className="text-foreground">Brand Documents</Label>
              <p className="text-xs text-muted-foreground">
                Upload text files (.txt, .md) or text-based PDFs containing brand guidelines, style guides, or documentation. <strong>Text files (.txt, .md) are recommended for best accuracy.</strong>
              </p>
              
              {/* PDF Warning Banner */}
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">PDF Upload Requirements</p>
                    <p className="text-yellow-700 dark:text-yellow-300 text-xs mb-2">
                      PDFs must have <strong>selectable text</strong> (not scanned images). If your PDF is a scan or photo, use the <strong>Manual Entry</strong> method instead.
                    </p>
                    <p className="text-yellow-600 dark:text-yellow-400 text-xs">
                      <strong>Tip:</strong> Open your PDF and try to select text with your cursor. If you can't select text, it won't work.
                    </p>
                  </div>
                </div>
              </div>
              
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
                  relative border-2 border-dashed rounded-lg p-8 text-center transition-all
                  ${isDragging 
                    ? 'border-primary bg-primary/5 scale-[1.02]' 
                    : 'border-border/40 bg-muted/20 hover:border-primary/50 hover:bg-muted/30'
                  }
                  ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                `}
              >
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown"
                  multiple
                  onChange={handleFileInputChange}
                  disabled={isProcessing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <div className="flex flex-col items-center gap-3">
                  <FileUp className="h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {isDragging ? 'Drop files here' : 'Drag & drop PDF, TXT, or Markdown files here'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or click to browse • Max 20MB per file
                    </p>
                  </div>
                </div>
              </div>

              {/* Staging Area */}
              {stagedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-foreground">
                      Files Ready to Upload ({stagedFiles.length})
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStagedFiles([])}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear All
                    </Button>
                  </div>
                  
                  <div className="space-y-2 max-h-[200px] overflow-y-auto border border-border/40 rounded-md p-3 bg-muted/10">
                    {stagedFiles.map((file, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between gap-3 p-2 rounded bg-card border border-border/30 hover:border-border/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFileFromStaging(idx)}
                          disabled={isProcessing}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleUploadStagedFiles}
                    disabled={isProcessing}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload {stagedFiles.length} Document{stagedFiles.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Enhanced Success State */}
              {uploadStatus === "success" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative overflow-hidden rounded-lg border border-forest-ink/20 bg-gradient-to-br from-forest-ink/5 to-transparent p-6"
                >
                  <div className="flex items-center gap-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2 }}
                      className="h-12 w-12 rounded-full bg-forest-ink/10 flex items-center justify-center"
                    >
                      <CheckCircle2 className="h-6 w-6 text-forest-ink" />
                    </motion.div>
                    <div>
                      <h4 className="font-serif text-lg text-ink mb-1">Documents Secured</h4>
                      <p className="text-sm text-charcoal/70">Your brand knowledge is now preserved</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-forest-ink/5 to-transparent animate-shimmer pointer-events-none" />
                </motion.div>
              )}

              {uploadStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-deep-burgundy bg-deep-burgundy/10 p-3 rounded-md border border-deep-burgundy/20">
                  <AlertCircle className="h-4 w-4" />
                  Failed to upload documents. Please try again.
                </div>
              )}

              {/* Skip Button */}
              <Button 
                variant="ghost" 
                onClick={handleSkipForNow}
                className="w-full mt-4 text-charcoal/60 hover:text-charcoal text-sm"
              >
                I'll add this later
                <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* URL Method Content */}
        {selectedMethod === "url" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="websiteUrl" className="text-foreground">
                Website URL
              </Label>
              <p className="text-xs text-muted-foreground">
                We'll analyze your website to extract brand voice, tone, and vocabulary patterns.
              </p>
              <div className="flex gap-2">
                <Input
                  id="websiteUrl"
                  type="url"
                  placeholder="https://your-brand.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={isProcessing}
                  className="flex-1 bg-input border-border/40"
                />
                <Button
                  onClick={handleUrlScrape}
                  disabled={isProcessing || !websiteUrl.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Scan
                    </>
                  )}
                </Button>
              </div>

              {/* Enhanced Processing State */}
              {isProcessing && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-brass/20" />
                    <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-brass border-t-transparent animate-spin" style={{ animationDuration: '1s' }} />
                  </div>
                  <p className="font-serif text-sm text-charcoal">Analyzing your website...</p>
                </div>
              )}

              {/* Enhanced Success State */}
              {uploadStatus === "success" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative overflow-hidden rounded-lg border border-forest-ink/20 bg-gradient-to-br from-forest-ink/5 to-transparent p-6"
                >
                  <div className="flex items-center gap-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2 }}
                      className="h-12 w-12 rounded-full bg-forest-ink/10 flex items-center justify-center"
                    >
                      <CheckCircle2 className="h-6 w-6 text-forest-ink" />
                    </motion.div>
                    <div>
                      <h4 className="font-serif text-lg text-ink mb-1">Brand Knowledge Extracted</h4>
                      <p className="text-sm text-charcoal/70">Your website has been analyzed successfully</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-forest-ink/5 to-transparent animate-shimmer pointer-events-none" />
                </motion.div>
              )}

              {uploadStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-deep-burgundy bg-deep-burgundy/10 p-3 rounded-md border border-deep-burgundy/20">
                  <AlertCircle className="h-4 w-4" />
                  Failed to scan website. Please try again.
                </div>
              )}

              {/* Skip Button */}
              <Button 
                variant="ghost" 
                onClick={handleSkipForNow}
                className="w-full mt-4 text-charcoal/60 hover:text-charcoal text-sm"
              >
                I'll add this later
                <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Manual Method Content */}
        {selectedMethod === "manual" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Copy-Paste from PDF Helper */}
            <div className="bg-brass/5 border border-brass/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-brass/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-brass" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium text-ink mb-2">Copy-Paste from Your PDF</p>
                  <ol className="text-xs text-charcoal/70 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="font-mono text-brass">1.</span>
                      <span>Open your PDF document</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-mono text-brass">2.</span>
                      <span>Select all text (<kbd className="px-1.5 py-0.5 bg-charcoal/10 rounded text-xs font-mono">Cmd+A</kbd> or <kbd className="px-1.5 py-0.5 bg-charcoal/10 rounded text-xs font-mono">Ctrl+A</kbd>)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-mono text-brass">3.</span>
                      <span>Copy (<kbd className="px-1.5 py-0.5 bg-charcoal/10 rounded text-xs font-mono">Cmd+C</kbd> or <kbd className="px-1.5 py-0.5 bg-charcoal/10 rounded text-xs font-mono">Ctrl+C</kbd>)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-mono text-brass">4.</span>
                      <span>Paste below (<kbd className="px-1.5 py-0.5 bg-charcoal/10 rounded text-xs font-mono">Cmd+V</kbd> or <kbd className="px-1.5 py-0.5 bg-charcoal/10 rounded text-xs font-mono">Ctrl+V</kbd>)</span>
                    </li>
                  </ol>
                  <p className="text-xs text-brass mt-2">This method always works, regardless of PDF type</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandVoice" className="text-foreground">
                Brand Voice & Guidelines
              </Label>
              <p className="text-xs text-muted-foreground">
                Paste your brand guidelines, style guide content, or describe your brand's tone, personality, and preferred writing style.
              </p>
              <Textarea
                id="brandVoice"
                placeholder="Paste your brand guidelines here, or type manually...

Our brand voice is warm, elegant, and poetic. We use sensory language and evocative descriptions..."
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                disabled={isProcessing}
                rows={10}
                className="bg-input border-border/40 resize-none font-mono text-sm"
              />
              <Button
                onClick={handleManualVoice}
                disabled={isProcessing || !brandVoice.trim()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Save Brand Voice
                  </>
                )}
              </Button>

              {/* Skip Button */}
              <Button 
                variant="ghost" 
                onClick={handleSkipForNow}
                className="w-full mt-4 text-charcoal/60 hover:text-charcoal text-sm"
              >
                I'll add this later
                <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Back to Options Button */}
        {selectedMethod && (
          <Button 
            variant="outline"
            onClick={() => setSelectedMethod(null)}
            className="mt-4"
          >
            ← Back to Options
          </Button>
        )}

        {/* Reassurance Message */}
        {!selectedMethod && (
          <p className="text-xs text-center text-charcoal/50 mt-6">
            Don't worry — you can always add brand documents later from Settings
          </p>
        )}

        {/* Uploaded Documents List */}
        <div className="mt-8 pt-6 border-t border-border/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Uploaded Documents</h3>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Extracted knowledge appears in the <span className="font-medium text-primary">Inspector</span> below ↓
            </p>
          </div>
          
          {loadingDocuments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : uploadedDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uploadedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-2 p-4 border border-border/30 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-foreground">{doc.file_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(doc.file_size)} • {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    
                    {/* Processing Status Badge */}
                    {doc.processing_status === 'pending' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 capitalize flex-shrink-0 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Pending
                      </span>
                    )}
                    {doc.processing_status === 'processing' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 capitalize flex-shrink-0 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processing
                      </span>
                    )}
                    {doc.processing_status === 'completed' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-300 capitalize flex-shrink-0 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready
                      </span>
                    )}
                    {doc.processing_status === 'failed' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 capitalize flex-shrink-0 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {/* Retry button for pending/failed documents */}
                    {(doc.processing_status === 'pending' || doc.processing_status === 'failed') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetryProcessing(doc)}
                        disabled={isProcessing}
                        className="hover:bg-accent text-brass hover:text-brass"
                        title="Retry processing"
                      >
                        <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadDocument(doc)}
                      className="hover:bg-accent"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDocument(doc)}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                  {/* Error message for failed documents */}
                  {doc.processing_status === 'failed' && doc.content_preview && (
                    <div className="ml-8 mt-1 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
                      <p className="font-medium mb-1">Error:</p>
                      <p className="whitespace-pre-wrap">{doc.content_preview}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Brand Knowledge Inspector */}
        <div className="mt-8 pt-6 border-t border-border/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brass" />
              Brand Knowledge Inspector
            </h3>
            {brandKnowledge.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllKnowledge}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            This shows all extracted brand knowledge. Delete entries to start fresh or remove incorrect data.
          </p>

          {loadingKnowledge ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : brandKnowledge.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No brand knowledge extracted yet</p>
              <p className="text-xs mt-1">Upload documents or scan a website to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {brandKnowledge.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 border border-border/30 rounded-lg hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs capitalize">
                          {entry.knowledge_type.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      {/* Display a summary of the content */}
                      <div className="text-sm text-muted-foreground">
                        {entry.knowledge_type === 'website_scrape' && entry.content?.scraped_pages && (
                          <p>Scanned: {entry.content.scraped_pages.join(', ').substring(0, 100)}...</p>
                        )}
                        {entry.knowledge_type === 'voice_manual' && entry.content?.description && (
                          <p className="line-clamp-2">{entry.content.description}</p>
                        )}
                        {entry.knowledge_type === 'brand_dna_scan' && entry.content?.sourceUrl && (
                          <p>Source: {entry.content.sourceUrl}</p>
                        )}
                        {entry.knowledge_type === 'document_extraction' && entry.content?.document_name && (
                          <p>From: {entry.content.document_name}</p>
                        )}
                        {/* Fallback for other types */}
                        {!['website_scrape', 'voice_manual', 'brand_dna_scan', 'document_extraction'].includes(entry.knowledge_type) && (
                          <p className="line-clamp-2">
                            {JSON.stringify(entry.content).substring(0, 150)}...
                          </p>
                        )}
                      </div>

                      {/* Show key insights if available */}
                      {entry.content?.brand_voice?.tone && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.content.brand_voice.tone.slice(0, 3).map((tone: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {tone}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteKnowledge(entry.id, entry.knowledge_type)}
                      className="hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                      title="Delete this knowledge entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
