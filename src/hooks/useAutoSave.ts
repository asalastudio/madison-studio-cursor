import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AUTOSAVE_CONFIG } from "@/config/autosaveConfig";

export type SaveStatus = "unsaved" | "saving" | "saved";

interface UseAutoSaveProps {
  content: string;
  contentId?: string;
  contentName: string;
  delay?: number;
  tableName?: "master_content" | "derivative_assets" | "outputs"; // Which table to save to
  fieldName?: string; // Which field to update (e.g., 'full_content' or 'generated_content')
  extraUpdateFields?: Record<string, unknown>;
}

export function useAutoSave({ 
  content, 
  contentId, 
  contentName,
  delay = AUTOSAVE_CONFIG.STANDARD_DELAY,
  tableName = "master_content",
  fieldName = "full_content",
  extraUpdateFields = {}
}: UseAutoSaveProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | undefined>(undefined);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedContent = useRef<string>(content);
  
  // Store current values in refs to avoid stale closures
  const contentRef = useRef(content);
  const contentIdRef = useRef(contentId);
  const contentNameRef = useRef(contentName);
  const tableNameRef = useRef(tableName);
  const fieldNameRef = useRef(fieldName);
  const extraUpdateFieldsRef = useRef(extraUpdateFields);
  
  // Update refs when props change
  useEffect(() => {
    contentRef.current = content;
    contentIdRef.current = contentId;
    contentNameRef.current = contentName;
    tableNameRef.current = tableName;
    fieldNameRef.current = fieldName;
    extraUpdateFieldsRef.current = extraUpdateFields;
  }, [content, contentId, contentName, tableName, fieldName, extraUpdateFields]);

  const save = useCallback(async () => {
    const currentContent = contentRef.current;
    const currentContentId = contentIdRef.current;
    const currentContentName = contentNameRef.current;
    const currentTableName = tableNameRef.current;
    const currentFieldName = fieldNameRef.current;
    const currentExtraUpdateFields = extraUpdateFieldsRef.current;

    if (currentContent === lastSavedContent.current) {
      return;
    }

    setSaveStatus("saving");

    try {
      // Save to localStorage first (fast)
      localStorage.setItem('madison-content-draft', JSON.stringify({
        id: currentContentId,
        title: currentContentName,
        content: currentContent,
        savedAt: new Date().toISOString()
      }));

      // Save to database if we have a contentId
      if (currentContentId) {
        console.log('[AutoSave] Saving to:', currentTableName, currentFieldName, 'id:', currentContentId);
        console.log('[AutoSave] Content preview (first 200 chars):', currentContent?.substring(0, 200));
        
        // Build update payload - only master_content has updated_at column
        const updatePayload: Record<string, any> = {
          [currentFieldName]: currentContent,
          ...currentExtraUpdateFields,
        };
        
        // Only add updated_at for tables that have it
        if (currentTableName === 'master_content') {
          updatePayload.updated_at = new Date().toISOString();
        }
        
        // Use .select() to verify the update actually worked and see what was saved
        const { data, error, count } = await supabase
          .from(currentTableName)
          .update(updatePayload)
          .eq('id', currentContentId)
          .select(currentFieldName);

        console.log('[AutoSave] Update response:', { 
          data, 
          error, 
          rowsAffected: data?.length || 0,
          savedContentPreview: data?.[0]?.[currentFieldName]?.substring(0, 200)
        });

        if (error) {
          console.error('[AutoSave] Database error:', error);
          throw error;
        }
        
        if (!data || data.length === 0) {
          console.error('[AutoSave] ❌ WARNING: No rows were updated! Check RLS policies or ID mismatch.');
          console.error('[AutoSave] This usually means RLS is blocking the update.');
        } else {
          // Verification: Query the database again to confirm the save
          const { data: verifyData } = await supabase
            .from(currentTableName)
            .select(currentFieldName)
            .eq('id', currentContentId)
            .single();
          
          const savedContent = verifyData?.[currentFieldName] || '';
          const hasReadMore = savedContent.toLowerCase().includes('read more');
          const hasUrl = savedContent.includes('http://') || savedContent.includes('https://');
          
          console.log('[AutoSave] ✅ VERIFICATION - Database now contains:', {
            id: currentContentId,
            contentLength: savedContent.length,
            contentPreview: savedContent.substring(0, 300),
            hasReadMore,
            hasUrl,
            matchesWhatWeSaved: savedContent === currentContent
          });
          
          if (!savedContent.includes(currentContent.substring(0, 50))) {
            console.error('[AutoSave] ⚠️ MISMATCH: Database content does not match what we tried to save!');
            console.error('[AutoSave] We tried to save:', currentContent.substring(0, 200));
            console.error('[AutoSave] But database has:', savedContent.substring(0, 200));
          }
        }
      }

      lastSavedContent.current = currentContent;
      const savedTime = new Date();
      setLastSavedAt(savedTime);
      setSaveStatus("saved");
      console.log('[AutoSave] Saved at:', savedTime.toLocaleTimeString());
    } catch (error) {
      console.error("[AutoSave] Error:", error);
      setSaveStatus("unsaved");
      throw error; // Re-throw so forceSave knows it failed
    }
  }, []);

  useEffect(() => {
    // Clear any pending save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If content hasn't changed, don't mark as unsaved
    if (content === lastSavedContent.current) {
      return;
    }

    // Mark as unsaved immediately
    setSaveStatus("unsaved");

    // Debounce the save
    timeoutRef.current = setTimeout(async () => {
      await save();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, delay, save]);

  const forceSave = useCallback(async () => {
    await save();
  }, [save]);

  const forceSaveAndGetTimestamp = useCallback(async (): Promise<Date | undefined> => {
    await save();
    return lastSavedAt;
  }, [save, lastSavedAt]);

  return { saveStatus, lastSavedAt, forceSave, forceSaveAndGetTimestamp };
}
