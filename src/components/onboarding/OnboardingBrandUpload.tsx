import { useState, useCallback } from "react";
import { X, Upload, FileText, ArrowRight, ArrowLeft, Check, Lightbulb, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingProgressBar } from "./OnboardingProgressBar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { VideoHelpTrigger } from "@/components/help/VideoHelpTrigger";
import madisonLogo from "@/assets/madison-horizontal-logo.png";
import { getOrCreateOrganizationId } from "@/lib/organization";
import { logger } from "@/lib/logger";

interface OnboardingBrandUploadProps {
  onContinue: (data: any) => void;
  onBack: () => void;
  onSkip: () => void;
  brandData: any;
}

type UploadMethod = "pdf" | "manual" | null;

export function OnboardingBrandUpload({ onContinue, onBack, onSkip, brandData }: OnboardingBrandUploadProps) {
  const { user } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<UploadMethod>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isValidFile = (file: File): boolean => {
    return (
      file.type === "application/pdf" ||
      file.type === "text/plain" ||
      file.type === "text/markdown" ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.markdown')
    );
  };

  const handleFilesAdded = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFile = fileArray.find(file => isValidFile(file));

    if (!validFile) {
      toast({
        title: "Invalid file",
        description: "Please upload a PDF, TXT, or Markdown file",
        variant: "destructive"
      });
      return;
    }

    setUploadedFile(validFile);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFilesAdded([file]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFilesAdded(files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleContinue = async () => {
    if (!isValid()) return;

    setIsProcessing(true);

    try {
      if (!user?.id) {
        throw new Error('User not authenticated. Please refresh the page and try again.');
      }

      // Verify authentication session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        logger.error('Session error:', sessionError);
        throw new Error('Session expired. Please refresh the page and try again.');
      }

      const organizationId = await getOrCreateOrganizationId(user.id);
      
      if (!organizationId) {
        throw new Error('Failed to get organization. Please try again.');
      }

      let uploadContent = "";

      if (selectedMethod === "pdf" && uploadedFile) {
        // Generate unique file path with random component to avoid conflicts
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 9);
        const sanitizedFileName = uploadedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${organizationId}/${timestamp}_${randomId}_${sanitizedFileName}`;

        // Upload file to Supabase Storage
        logger.debug('Uploading file to storage:', { 
          filePath, 
          fileName: uploadedFile.name, 
          size: uploadedFile.size,
          organizationId,
          userId: user?.id
        });
        
        // Verify we have a valid session before uploading
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) {
          throw new Error('Session expired. Please refresh the page and try again.');
        }

        // Test bucket accessibility first
        logger.debug('Testing bucket accessibility...');
        const { data: bucketTest, error: bucketError } = await supabase.storage
          .from('brand-documents')
          .list(organizationId, { limit: 1 });

        if (bucketError && !bucketError.message?.includes('not found')) {
          logger.warn('Bucket test returned error (may be normal if folder is empty):', bucketError);
        }

        // Attempt upload with detailed error handling
        let uploadData, uploadError;
        try {
          const uploadResult = await supabase.storage
          .from('brand-documents')
            .upload(filePath, uploadedFile, {
              cacheControl: '3600',
              upsert: true // Allow overwriting if file exists
            });
          uploadData = uploadResult.data;
          uploadError = uploadResult.error;
        } catch (err: any) {
          // Catch any unexpected errors during upload
          logger.error('Upload exception caught:', err);
          uploadError = {
            message: err.message || 'Unexpected upload error',
            statusCode: err.status || 0,
            error: err.name || 'UploadException'
          } as any;
        }

        if (uploadError) {
          logger.error('Storage upload error details:', {
            error: uploadError,
            message: uploadError.message,
            statusCode: (uploadError as any).statusCode,
            errorCode: (uploadError as any).error,
            filePath,
            fileName: uploadedFile.name,
            hasSession: !!currentSession,
            organizationId
          });
          
          // Provide more helpful error messages based on error type
          let errorMessage = uploadError.message || 'Unknown upload error';
          
          // Check for specific error codes
          const statusCode = (uploadError as any).statusCode;
          const errorCode = (uploadError as any).error;
          
          if (uploadError.message?.includes('Failed to fetch') || statusCode === 0 || !statusCode) {
            // Log detailed info for debugging
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            logger.error('Failed to fetch - Network diagnostics:', {
              supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET',
              hasSession: !!currentSession,
              fileSize: uploadedFile.size,
              fileName: uploadedFile.name,
              organizationId
            });
            
            errorMessage = 'Network error: Unable to reach Supabase Storage. This could be:\n' +
              '1. CORS configuration issue - Check Supabase Dashboard → Settings → API → CORS\n' +
              '2. Storage service not enabled - Verify in Supabase Dashboard\n' +
              '3. Network connectivity issue\n\n' +
              'Please check the browser Console (F12) → Network tab for the failed request details.';
          } else if (uploadError.message?.includes('JWT') || uploadError.message?.includes('auth') || statusCode === 401) {
            errorMessage = 'Authentication error. Your session may have expired. Please refresh the page and try again.';
          } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy') || statusCode === 403) {
            errorMessage = 'Permission denied. Please check that the storage bucket RLS policies allow uploads for authenticated users.';
          } else if (statusCode === 404) {
            errorMessage = 'Storage bucket not found. Please verify the "brand-documents" bucket exists in your Supabase Storage.';
          } else if (statusCode === 409) {
            errorMessage = 'File already exists. This should not happen with unique file paths. Please try again.';
          }
          
          throw new Error(`Upload failed: ${errorMessage}`);
        }

        logger.debug('File uploaded successfully:', uploadData);

        // Detect file type properly
        let fileType = uploadedFile.type || 'application/pdf';
        if (uploadedFile.name.endsWith('.md') || uploadedFile.name.endsWith('.markdown')) {
          fileType = 'text/markdown';
        } else if (uploadedFile.name.endsWith('.txt')) {
          fileType = 'text/plain';
        }

        // Create document record
        const { data: docData, error: docError } = await supabase
          .from('brand_documents')
          .insert({
            organization_id: organizationId,
            uploaded_by: user?.id,
            file_name: uploadedFile.name,
            file_type: fileType,
            file_size: uploadedFile.size,
            file_url: filePath,
            processing_status: 'pending'
          })
          .select()
          .single();

        if (docError) {
          logger.error('Document insert error:', docError);
          throw new Error(`Failed to save document: ${docError.message}`);
        }

        // Trigger document processing in background
        if (docData) {
          supabase.functions.invoke('process-brand-document', {
            body: { documentId: docData.id }
          }).catch(err => {
            logger.error('Failed to trigger processing:', err);
            // Don't throw - processing can happen async
          });
        }

        uploadContent = uploadedFile.name;
      } else if (selectedMethod === "manual") {
        uploadContent = manualText;

        // Save manual entry directly to brand_knowledge
        const { error: knowledgeError } = await supabase
          .from('brand_knowledge')
          .insert({
            organization_id: organizationId,
            knowledge_type: 'brand_guidelines',
            content: { text: manualText }
          });

        if (knowledgeError) throw knowledgeError;
      }

      onContinue({
        uploadMethod: selectedMethod,
        uploadContent
      });
    } catch (error) {
      logger.error('Error processing brand upload:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to process your brand guidelines. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isValid = () => {
    if (selectedMethod === "pdf") return !!uploadedFile;
    if (selectedMethod === "manual") return manualText.trim().length >= 200;
    return false;
  };

  const getCharacterFeedback = () => {
    const length = manualText.trim().length;
    if (length < 200) {
      return (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Add more details for better AI understanding ({length}/200 characters)
        </p>
      );
    }
    return (
      <p className="text-xs text-green-600 flex items-center gap-1">
        <Check className="w-3 h-3" />
        Great! This gives us enough context ({length} characters)
      </p>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 shrink-0 border-b border-border/10">
        <img src={madisonLogo} alt="MADISON" className="h-6 opacity-90" />
        <div className="flex items-center gap-4">
          <VideoHelpTrigger videoId="understanding-brand-guidelines" variant="icon" />
          <button
            onClick={onSkip}
            className="text-charcoal/40 hover:text-charcoal transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-6 overflow-y-auto">
        <div className="w-full max-w-3xl space-y-6">
          <div className="text-center space-y-4">
            <OnboardingProgressBar currentStep={2} />

            <div className="space-y-2">
              <h1 className="font-serif text-3xl text-ink-black">
                {brandData.brandDNA ? "Now let's go deeper" : "Brand Guidelines"}
              </h1>
              
              {brandData.brandDNA && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brass/5 border border-brass/20 mb-2">
                  <Check className="w-3 h-3 text-green-600" />
                  <span className="text-xs font-medium text-charcoal/80">Visual DNA captured</span>
                </div>
              )}

              <p className="text-base text-charcoal/70 font-light max-w-lg mx-auto">
                {brandData.brandDNA
                  ? "Upload documents to teach Madison your unique brand voice and messaging."
                  : "Help our AI understand your brand's unique voice."}
              </p>
            </div>
          </div>

          {/* Upload Method Cards - More Compact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setSelectedMethod("pdf")}
              className={`group relative p-4 rounded-xl border transition-all text-left ${selectedMethod === "pdf"
                ? "border-brass bg-white shadow-md shadow-brass/5"
                : "border-charcoal/10 bg-white/50 hover:border-brass/40 hover:bg-white"
                }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${selectedMethod === "pdf" ? "bg-brass/10 text-brass" : "bg-charcoal/5 text-charcoal/60 group-hover:text-brass group-hover:bg-brass/5"} transition-colors`}>
                  <Upload className="w-5 h-5" />
                </div>
                <Badge variant="secondary" className="bg-green-600/90 text-white border-0 text-[10px] px-2 h-5">
                  Best
                </Badge>
              </div>
              <h3 className="font-medium text-gray-900 mb-1">Upload Files</h3>
              <p className="text-xs text-charcoal/60 leading-relaxed">
                PDF, TXT, or Markdown files
              </p>
            </button>

            <button
              onClick={() => setSelectedMethod("manual")}
              className={`group relative p-4 rounded-xl border transition-all text-left ${selectedMethod === "manual"
                ? "border-brass bg-white shadow-md shadow-brass/5"
                : "border-charcoal/10 bg-white/50 hover:border-brass/40 hover:bg-white"
                }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${selectedMethod === "manual" ? "bg-brass/10 text-brass" : "bg-charcoal/5 text-charcoal/60 group-hover:text-brass group-hover:bg-brass/5"} transition-colors`}>
                  <FileText className="w-5 h-5" />
                </div>
              </div>
              <h3 className="font-medium text-gray-900 mb-1">Manual Entry</h3>
              <p className="text-xs text-charcoal/60 leading-relaxed">
                Type guidelines directly
              </p>
            </button>
          </div>

          {/* Method-specific Input Area - Compact */}
          <div className="min-h-[140px]">
            {selectedMethod === "pdf" && (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !isProcessing && document.getElementById('file-upload')?.click()}
                className={`relative w-full p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all text-center group bg-white/30 ${
                  isDragging
                    ? "border-brass bg-brass/5 scale-[1.02]"
                    : "border-charcoal/10 hover:border-brass/50 hover:bg-white"
                } ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
              >
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-10 h-10 rounded-full bg-charcoal/5 mx-auto mb-3 flex items-center justify-center group-hover:bg-brass/10 group-hover:text-brass transition-colors">
                  <Upload className="w-5 h-5 text-charcoal/40 group-hover:text-brass" />
                </div>
                {uploadedFile ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                    <p className="text-xs text-charcoal/50 mt-0.5">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {isDragging ? "Drop file here" : "Click to upload or drag and drop"}
                    </p>
                    <p className="text-xs text-charcoal/50 mt-0.5">PDF, TXT, or Markdown files</p>
                  </div>
                )}
              </div>
            )}

            {selectedMethod === "manual" && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Describe your brand voice, tone, values, and style guidelines..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && handleContinue()}
                  rows={6}
                  className="resize-none bg-white border-charcoal/10 focus:border-brass/50 transition-colors"
                />
                <div className="flex justify-between items-start">
                  {getCharacterFeedback()}
                  <p className="text-[10px] text-muted-foreground pt-1">Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'} + Enter to continue</p>
                </div>
              </div>
            )}
            
            {!selectedMethod && (
              <div className="h-full flex items-center justify-center p-8 border-2 border-dashed border-transparent rounded-xl">
                <p className="text-sm text-charcoal/40 italic">Select an upload method above</p>
              </div>
            )}
          </div>

          {/* Action Buttons - Fixed at bottom or naturally flowing */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={onBack}
              variant="ghost"
              className="h-11 px-4 text-charcoal/60 hover:text-charcoal hover:bg-charcoal/5"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <div className="flex-1" />

            <Button
              onClick={onSkip}
              variant="ghost"
              className="h-11 px-6 text-charcoal/60 hover:text-charcoal hover:bg-charcoal/5"
            >
              Skip for now
            </Button>

            <Button
              onClick={handleContinue}
              disabled={!isValid() || isProcessing}
              variant="brass"
              className="h-11 px-8 min-w-[140px]"
            >
              {isProcessing ? "Processing..." : "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
