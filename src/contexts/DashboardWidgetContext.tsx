import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { DashboardWidget, DashboardWidgetType } from '@/components/dashboard/DashboardWidgetSystem';
import { useToast } from '@/hooks/use-toast';

interface DashboardWidgetContextType {
  widgets: DashboardWidget[];
  isEditMode: boolean;
  toggleEditMode: () => void;
  addWidget: (type: DashboardWidgetType) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
  resetWidgets: () => void;
  saveWidgets: (showSuccessToast?: boolean) => Promise<void>;
}

const DashboardWidgetContext = createContext<DashboardWidgetContextType | undefined>(undefined);

// Default widget layout - Hero is first, widgets can be to the right and below
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'hero', type: 'hero-banner', w: 10, h: 1, x: 0, y: 0 }, // Hero takes 10 columns, leaving 2 on right
  { id: 'w1', type: 'strategy-session', w: 2, h: 1, x: 10, y: 0 }, // Compact card - 1 unit high
  { id: 'w2', type: 'pipeline-overview', w: 4, h: 3, x: 0, y: 1 }, // Below hero
  { id: 'w3', type: 'team-activity', w: 4, h: 3, x: 4, y: 2 },
  { id: 'w4', type: 'revenue-overview', w: 4, h: 3, x: 8, y: 2 },
  { id: 'w5', type: 'content-pipeline', w: 6, h: 4, x: 0, y: 5 },
  { id: 'w6', type: 'momentum-tracker', w: 6, h: 4, x: 6, y: 5 },
  { id: 'w7', type: 'quick-links', w: 8, h: 2, x: 0, y: 9 }, // Smaller default height
  { id: 'w8', type: 'this-week', w: 12, h: 3, x: 0, y: 11 },
];

export function DashboardWidgetProvider({ children }: { children: React.ReactNode }) {
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadDoneRef = useRef(false);
  const loadErrorRef = useRef(false);

  // Load widgets from database
  useEffect(() => {
    const loadWidgets = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      initialLoadDoneRef.current = false;
      loadErrorRef.current = false;

      try {
        const { data } = await supabase
          .from('organizations')
          .select('settings')
          .eq('id', organizationId)
          .single();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settings = data?.settings as Record<string, any> | null;
        if (settings?.dashboardWidgets) {
          const loadedWidgets = settings.dashboardWidgets as DashboardWidget[];
          // Ensure hero banner is always present
          const hasHero = loadedWidgets.some(w => w.type === 'hero-banner');
          if (!hasHero) {
            // Add hero banner if missing
            const heroWidget: DashboardWidget = { id: 'hero', type: 'hero-banner', w: 10, h: 1, x: 0, y: 0 };
            // Adjust other widgets to be below hero
            const adjustedWidgets = loadedWidgets.map(w => ({
              ...w,
              y: w.y === 0 ? w.y + 2 : w.y, // Move widgets at y:0 to y:2
            }));
            setWidgets([heroWidget, ...adjustedWidgets]);
          } else {
            setWidgets(loadedWidgets);
          }
        } else {
          // No saved widgets, use default
          setWidgets(DEFAULT_WIDGETS);
        }
      } catch (error) {
        console.error('Error loading dashboard widgets:', error);
        loadErrorRef.current = true;
        // On error, use default widgets but do NOT save (would overwrite user's layout)
        setWidgets(DEFAULT_WIDGETS);
      } finally {
        setIsLoading(false);
        initialLoadDoneRef.current = true;
      }
    };

    loadWidgets();
  }, [organizationId]);

  // Save widgets to database (showToast = only show success toast when explicitly saving, e.g. on "Done Editing")
  const saveWidgets = useCallback(async (showSuccessToast = false) => {
    if (!organizationId || isLoading || !initialLoadDoneRef.current || loadErrorRef.current) return;

    try {
      const { data: orgData, error: fetchError } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId)
        .single();

      if (fetchError || orgData == null) {
        toast({
          title: 'Could not load organization settings',
          description: fetchError?.message,
          variant: 'destructive',
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentSettings = (orgData?.settings && typeof orgData.settings === 'object')
        ? orgData.settings as Record<string, any>
        : {};

      const updatedSettings = {
        ...currentSettings,
        dashboardWidgets: widgets,
      };

      const { error } = await supabase
        .from('organizations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ settings: updatedSettings as any })
        .eq('id', organizationId);

      if (error) {
        console.error('Error saving dashboard widgets:', error);
        toast({
          title: 'Failed to save dashboard',
          description: error.message,
          variant: 'destructive',
        });
      } else if (showSuccessToast) {
        toast({
          title: 'Layout saved',
          description: 'Your dashboard layout has been saved.',
        });
      }
    } catch (error) {
      console.error('Error saving dashboard widgets:', error);
      toast({
        title: 'Failed to save dashboard',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [organizationId, widgets, isLoading, toast]);

  // Auto-save only when in edit mode and widgets change (prevents overwriting on load/navigation)
  useEffect(() => {
    if (isEditMode && !isLoading && organizationId) {
      const timeoutId = setTimeout(() => {
        saveWidgets();
      }, 500); // Debounce saves

      return () => clearTimeout(timeoutId);
    }
  }, [widgets, isEditMode, isLoading, organizationId, saveWidgets]);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
    // Save when exiting edit mode and show confirmation
    if (isEditMode) {
      saveWidgets(true);
    }
  }, [isEditMode, saveWidgets]);

  const addWidget = useCallback((type: DashboardWidgetType) => {
    // Don't allow adding hero-banner (it's always present)
    if (type === 'hero-banner') return;

    const WIDGET_DEFAULTS: Record<DashboardWidgetType, { w: number; h: number }> = {
      'hero-banner': { w: 10, h: 1 },
      'pipeline-overview': { w: 4, h: 3 },
      'team-activity': { w: 4, h: 3 },
      'revenue-overview': { w: 4, h: 3 },
      'content-pipeline': { w: 6, h: 4 },
      'momentum-tracker': { w: 6, h: 4 },
      'strategy-session': { w: 2, h: 1 }, // Compact card
      'quick-links': { w: 8, h: 2 }, // Smaller default
      'this-week': { w: 12, h: 3 },
      'recent-activity': { w: 12, h: 4 },
      'google-meet': { w: 4, h: 3 }, // Compact preview
      'brand-health': { w: 4, h: 3 },
      'brand': { w: 4, h: 3 },
      'yellow-pad': { w: 6, h: 4 },
    };

    // Find the next available position
    const maxY = Math.max(...widgets.map(w => w.y + w.h), 0);
    const newWidget: DashboardWidget = {
      id: `w${Date.now()}`,
      type,
      ...WIDGET_DEFAULTS[type],
      x: 0,
      y: maxY,
    };

    setWidgets(prev => [...prev, newWidget]);
  }, [widgets]);

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => {
      const widget = prev.find(w => w.id === id);
      // Prevent removing hero banner
      if (widget?.type === 'hero-banner') {
        return prev;
      }
      return prev.filter(w => w.id !== id);
    });
  }, []);

  const updateWidget = useCallback((id: string, updates: Partial<DashboardWidget>) => {
    setWidgets(prev => {
      const updated = prev.map(w => {
        if (w.id === id) {
          const updatedWidget = { ...w, ...updates };
          // Ensure hero banner stays at y: 0
          if (updatedWidget.type === 'hero-banner' && 'y' in updates && updates.y !== 0) {
            updatedWidget.y = 0;
          }
          return updatedWidget;
        }
        return w;
      });
      // Ensure hero banner is always first (y: 0, x: 0)
      const hero = updated.find(w => w.type === 'hero-banner');
      if (hero && (hero.y !== 0 || hero.x !== 0)) {
        hero.y = 0;
        hero.x = 0;
      }
      return updated;
    });
  }, []);

  const resetWidgets = useCallback(() => {
    // Always ensure hero is present when resetting
    setWidgets(DEFAULT_WIDGETS);
  }, []);

  // Ensure hero banner is always present and at the top
  useEffect(() => {
    if (!isLoading && widgets.length > 0) {
      const hasHero = widgets.some(w => w.type === 'hero-banner');
      if (!hasHero) {
        // Add hero banner if missing
        const heroWidget: DashboardWidget = { id: 'hero', type: 'hero-banner', w: 10, h: 2, x: 0, y: 0 };
        setWidgets(prev => {
          // Sort to ensure hero is first
          const others = prev.filter(w => w.type !== 'hero-banner');
          return [heroWidget, ...others];
        });
      } else {
        // Ensure hero is at y: 0 and x: 0
        const hero = widgets.find(w => w.type === 'hero-banner');
        if (hero && (hero.y !== 0 || hero.x !== 0)) {
          setWidgets(prev => prev.map(w =>
            w.type === 'hero-banner' ? { ...w, x: 0, y: 0 } : w
          ));
        }
      }
    }
  }, [widgets, isLoading]);

  return (
    <DashboardWidgetContext.Provider
      value={{
        widgets,
        isEditMode,
        toggleEditMode,
        addWidget,
        removeWidget,
        updateWidget,
        resetWidgets,
        saveWidgets,
      }}
    >
      {children}
    </DashboardWidgetContext.Provider>
  );
}

export function useDashboardWidgets() {
  const context = useContext(DashboardWidgetContext);
  if (context === undefined) {
    throw new Error('useDashboardWidgets must be used within a DashboardWidgetProvider');
  }
  return context;
}
