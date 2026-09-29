import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Lock, Upload, FileText, Trash2, X, FileUp, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

interface MadisonConfig {
  persona?: string;
  editorial_philosophy?: string;
  writing_influences?: string;
  forbidden_phrases?: string;
  quality_standards?: string;
  voice_spectrum?: string;
}

interface TrainingDocument {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  processing_status: string;
  created_at: string;
}

export function MadisonTrainingTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<MadisonConfig>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending = documents.filter((d) => d.processing_status === 'pending');
    pending.forEach(async (d) => {
      if (triggeredRef.current.has(d.id)) return;
      triggeredRef.current.add(d.id);
      try {
        await supabase.functions.invoke('process-madison-training-document', { body: { documentId: d.id } });
      } catch (e) {
        console.error('Auto-process trigger failed for document', d.id, e);
      }
    });
  }, [documents]);

  useEffect(() => {
    checkSuperAdminStatus();
  }, []);

  const checkSuperAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setIsSuperAdmin(false);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('super_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking super admin status:', error);
        setIsSuperAdmin(false);
      } else {
        setIsSuperAdmin(!!data);
        if (data) {
          loadMadisonConfig();
          loadDocuments();
        }
      }
    } catch (error) {
      console.error('Error in checkSuperAdminStatus:', error);
      setIsSuperAdmin(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMadisonConfig = async () => {
    const { data, error } = await supabase
      .from('madison_system_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error loading Madison config:', error);
      toast({
        title: "Error loading configuration",
        description: "Failed to load Madison's training settings",
        variant: "destructive",
      });
      return;
    }

    if (data) {
      setConfig({
        persona: data.persona || '',
        editorial_philosophy: data.editorial_philosophy || '',
        writing_influences: data.writing_influences || '',
        forbidden_phrases: data.forbidden_phrases || '',
        quality_standards: data.quality_standards || '',
        voice_spectrum: data.voice_spectrum || '',
      });
    }
  };

  const loadDocuments = async () => {
    const { data, error } = await supabase
      .from('madison_training_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading documents:', error);
      return;
    }

    if (data) {
      setDocuments(data);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Validate file type - support PDF, text, and markdown
    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    const allowedExtensions = ['.pdf', '.txt', '.md', '.markdown'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, TXT, or Markdown (.md) document. Text files are recommended for best accuracy.",
        variant: "destructive",
      });
      return;
    }

    await uploadFile(file);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFileSelect(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload to storage
      const fileName = `${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('madison-training-docs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create database record with storage path (private bucket)
      const { data: inserted, error: dbError } = await supabase
        .from('madison_training_documents')
        .insert({
          file_name: file.name,
          file_url: uploadData?.path ?? fileName,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        })
        .select('id')
        .maybeSingle();

      if (dbError) throw dbError;

      // Trigger backend processing
      if (inserted?.id) {
        await supabase.functions.invoke('process-madison-training-document', {
          body: { documentId: inserted.id },
        });
      }

      toast({
        title: "Document uploaded",
        description: "Processing has started. This may take up to a minute.",
      });

      loadDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload training document",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (doc: TrainingDocument) => {
    try {
      // Delete from storage (use stored path)
      const { error: storageError } = await supabase.storage
        .from('madison-training-docs')
        .remove([doc.file_url]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('madison_training_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      toast({
        title: "Document deleted",
        description: "Training document has been removed",
      });

      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete training document",
        variant: "destructive",
      });
    }
  };

  const handleRetryDocument = async (doc: TrainingDocument) => {
    try {
      await supabase
        .from('madison_training_documents')
        .update({ processing_status: 'pending' })
        .eq('id', doc.id);

      await supabase.functions.invoke('process-madison-training-document', {
        body: { documentId: doc.id },
      });

      toast({ title: 'Reprocessing started', description: `${doc.file_name} is being processed again.` });
      loadDocuments();
    } catch (error) {
      console.error('Error retrying document:', error);
      toast({ title: 'Retry failed', description: 'Could not reprocess the document.', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if config already exists
      const { data: existing } = await supabase
        .from('madison_system_config')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing config
        const { error } = await supabase
          .from('madison_system_config')
          .update({
            ...config,
            updated_at: new Date().toISOString(),
            updated_by: user.id
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new config
        const { error } = await supabase
          .from('madison_system_config')
          .insert({
            ...config,
            updated_by: user.id
          });

        if (error) throw error;
      }

      toast({
        title: "System configuration saved",
        description: "Madison's global training has been updated",
      });
    } catch (error) {
      console.error('Error saving Madison config:', error);
      toast({
        title: "Error saving",
        description: "Failed to save Madison's training settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Madison's Training is only accessible to platform administrators. This system-wide configuration affects how Madison operates across all organizations.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3 p-6 bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg border border-primary/20">
        <Sparkles className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-lg mb-2">Madison's System Training (Super Admin Only)</h3>
          <p className="text-sm text-muted-foreground">
            Configure Madison's core personality and editorial guidelines. These settings apply system-wide across all organizations.
          </p>
          <Alert className="mt-4">
            <AlertDescription className="text-xs">
              🔒 Super Admin Access - Changes here affect Madison's behavior for all users across the entire platform.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="persona" className="text-base font-medium">
            Madison's Persona & Backstory
          </Label>
          <p className="text-sm text-muted-foreground">
            Define her character, experience, and personality traits. This makes her less robotic and more engaging.
          </p>
          <Textarea
            id="persona"
            value={config.persona || ""}
            onChange={(e) => setConfig({ ...config, persona: e.target.value })}
            placeholder="Example: Madison is a seasoned editorial director with 15 years of luxury copywriting experience. She's precise yet warm, sophisticated but never pretentious. She has a slight preference for elegant restraint over flowery prose..."
            className="min-h-32 font-mono text-sm"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="editorial_philosophy" className="text-base font-medium">
            Editorial Philosophy
          </Label>
          <p className="text-sm text-muted-foreground">
            Her core beliefs about great copywriting and content creation.
          </p>
          <Textarea
            id="editorial_philosophy"
            value={config.editorial_philosophy || ""}
            onChange={(e) => setConfig({ ...config, editorial_philosophy: e.target.value })}
            placeholder="Example: Great copy sells without selling. It evokes desire through sensory details and emotional resonance. Every word must earn its place. Headlines must stop the scroll. Body copy must build anticipation..."
            className="min-h-32 font-mono text-sm"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="writing_influences" className="text-base font-medium">
            Writing Influences & Style Masters
          </Label>
          <p className="text-sm text-muted-foreground">
            The copywriting legends that shape her approach (J. Peterman, Ogilvy, Halbert, etc.)
          </p>
          <Textarea
            id="writing_influences"
            value={config.writing_influences || ""}
            onChange={(e) => setConfig({ ...config, writing_influences: e.target.value })}
            placeholder="Example: J. Peterman's narrative storytelling, David Ogilvy's research-driven headlines, Gary Halbert's emotional urgency, Claude Hopkins' specificity over abstraction..."
            className="min-h-32 font-mono text-sm"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="voice_spectrum" className="text-base font-medium">
            Voice Spectrum & Tonal Range
          </Label>
          <p className="text-sm text-muted-foreground">
            Define the range of voices she can adopt and when to use each.
          </p>
          <Textarea
            id="voice_spectrum"
            value={config.voice_spectrum || ""}
            onChange={(e) => setConfig({ ...config, voice_spectrum: e.target.value })}
            placeholder="Example: BRAND_VOICE (house voice), JAY_PETERMAN (narrative adventure), OGILVY (sophisticated persuasion), HYBRID (balanced elegance). Choose based on brand personality and content goal..."
            className="min-h-32 font-mono text-sm"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="forbidden_phrases" className="text-base font-medium">
            System-Wide Forbidden Phrases
          </Label>
          <p className="text-sm text-muted-foreground">
            Words and phrases Madison should never use across all brands.
          </p>
          <Textarea
            id="forbidden_phrases"
            value={config.forbidden_phrases || ""}
            onChange={(e) => setConfig({ ...config, forbidden_phrases: e.target.value })}
            placeholder="Example: 'game-changer', 'revolutionary', 'cutting-edge', 'leverage', 'synergy', 'innovative solution', clichés, corporate jargon..."
            className="min-h-24 font-mono text-sm"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="quality_standards" className="text-base font-medium">
            Quality Standards & Benchmarks
          </Label>
          <p className="text-sm text-muted-foreground">
            What makes content excellent vs. mediocre in her eyes.
          </p>
          <Textarea
            id="quality_standards"
            value={config.quality_standards || ""}
            onChange={(e) => setConfig({ ...config, quality_standards: e.target.value })}
            placeholder="Example: Every headline must create curiosity or promise benefit. First paragraph must hook within 3 seconds. Sensory details over abstract claims. Active voice preferred. One clear idea per paragraph..."
            className="min-h-32 font-mono text-sm"
          />
        </div>
      </div>

      {/* Training Documents Section */}
      <div className="space-y-4 mt-8 pt-8 border-t">
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Training Documents</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload comprehensive training documentation to teach Madison's writing style, copywriting techniques, and editorial guidelines. <strong>Text files (.txt, .md) are recommended for best accuracy.</strong>
            </p>
          </div>

          {/* File Format Recommendation */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">Recommended: Text Files</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs">
                  Upload your training documentation as <strong>.txt</strong> or <strong>.md</strong> files for 100% accuracy. Text files process instantly with no extraction errors, making them ideal for large training documents.
                </p>
              </div>
            </div>
          </div>

          {/* Drag and Drop Upload Area */}
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
              ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
            `}
          >
            <input
              type="file"
              id="doc-upload"
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
            
            <div className="flex flex-col items-center gap-3">
              <FileUp className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? 'Drop file here' : 'Drag & drop PDF, TXT, or Markdown file here'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse • Max 20MB per file
                </p>
              </div>
              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading and processing...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <Card key={doc.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(doc.file_size / 1024 / 1024).toFixed(2)} MB • {doc.processing_status === 'completed' ? 'Processed' : doc.processing_status === 'failed' ? 'Failed' : 'Processing...'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.processing_status !== 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetryDocument(doc)}
                      >
                        <Sparkles className="h-4 w-4 mr-1" /> Retry
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDocument(doc)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No training documents uploaded yet</p>
          </Card>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button 
          onClick={handleSave}
          disabled={isSaving}
          size="lg"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving System Config...
            </>
          ) : (
            "Save Madison's System Training"
          )}
        </Button>
      </div>
    </div>
  );
}