/**
 * Widget Context
 * 
 * Manages dashboard layout state and provides methods for widget operations.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { DashboardLayout, WidgetConfig, WidgetType, DEFAULT_LAYOUT, WIDGET_REGISTRY, WIDGET_SIZES } from './types';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';

interface WidgetContextType {
  layout: DashboardLayout;
  isLoading: boolean;
  isEditMode: boolean;
  setEditMode: (mode: boolean) => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (widgetId: string) => void;
  updateWidgetPosition: (widgetId: string, position: Partial<WidgetConfig['position']>) => void;
  updateWidgetSettings: (widgetId: string, settings: Record<string, any>) => void;
  resetToDefault: () => void;
  saveLayout: () => Promise<void>;
}

const WidgetContext = createContext<WidgetContextType | undefined>(undefined);

export function WidgetProvider({ children }: { children: ReactNode }) {
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const initialLoadDoneRef = useRef(false);

  // Load layout from database
  useEffect(() => {
    const loadLayout = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('settings')
          .eq('id', organizationId)
          .single();

        if (error) {
          console.error('[WidgetContext] Error loading layout:', error);
        } else if (data?.settings && typeof data.settings === 'object') {
          const settings = data.settings as Record<string, any>;
          if (settings.dashboardLayout && settings.dashboardLayout.widgets) {
            setLayout(settings.dashboardLayout);
          }
        }
      } catch (e) {
        console.error('[WidgetContext] Error loading layout:', e);
      } finally {
        setIsLoading(false);
        initialLoadDoneRef.current = true;
      }
    };

    loadLayout();
  }, [organizationId]);

  // Save layout to database
  const saveLayout = useCallback(async () => {
    if (!organizationId || !initialLoadDoneRef.current) return;

    try {
      // Get current settings
      const { data: orgData } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId)
        .single();

      const currentSettings = (orgData?.settings && typeof orgData.settings === 'object')
        ? orgData.settings as Record<string, any>
        : {};

      // Merge layout into settings
      const updatedSettings = {
        ...currentSettings,
        dashboardLayout: {
          ...layout,
          lastModified: new Date().toISOString(),
        },
      };

      const { error } = await supabase
        .from('organizations')
        .update({ settings: updatedSettings })
        .eq('id', organizationId);

      if (error) {
        console.error('[WidgetContext] Error saving layout:', error);
        toast({
          title: 'Failed to save layout',
          description: error.message,
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error('[WidgetContext] Error saving layout:', e);
      toast({
        title: 'Failed to save layout',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [organizationId, layout, toast]);

  // Add a new widget
  const addWidget = useCallback((type: WidgetType) => {
    const definition = WIDGET_REGISTRY[type];
    const defaultSize = WIDGET_SIZES[definition.defaultSize];
    
    // Find next available position
    const maxY = layout.widgets.reduce((max, w) => Math.max(max, w.position.y + w.position.h), 0);
    
    const newWidget: WidgetConfig = {
      id: `widget-${Date.now()}`,
      type,
      position: {
        x: 0,
        y: maxY,
        w: defaultSize.w,
        h: defaultSize.h,
      },
    };

    setLayout(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));

    toast({
      title: 'Widget added',
      description: `${definition.name} has been added to your dashboard.`,
    });
  }, [layout.widgets, toast]);

  // Remove a widget
  const removeWidget = useCallback((widgetId: string) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.filter(w => w.id !== widgetId),
    }));

    toast({
      title: 'Widget removed',
    });
  }, [toast]);

  // Update widget position
  const updateWidgetPosition = useCallback((widgetId: string, position: Partial<WidgetConfig['position']>) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId
          ? { ...w, position: { ...w.position, ...position } }
          : w
      ),
    }));
  }, []);

  // Update widget settings
  const updateWidgetSettings = useCallback((widgetId: string, settings: Record<string, any>) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId
          ? { ...w, settings: { ...w.settings, ...settings } }
          : w
      ),
    }));
  }, []);

  // Reset to default layout
  const resetToDefault = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    toast({
      title: 'Dashboard reset',
      description: 'Your dashboard has been reset to the default layout.',
    });
  }, [toast]);

  // Auto-save when layout changes (debounced) - saves during edit mode too
  useEffect(() => {
    if (isLoading || !initialLoadDoneRef.current || !organizationId) return;

    const timeoutId = setTimeout(() => {
      saveLayout();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [layout, isLoading, organizationId, saveLayout]);

  return (
    <WidgetContext.Provider
      value={{
        layout,
        isLoading,
        isEditMode,
        setEditMode: setIsEditMode,
        addWidget,
        removeWidget,
        updateWidgetPosition,
        updateWidgetSettings,
        resetToDefault,
        saveLayout,
      }}
    >
      {children}
    </WidgetContext.Provider>
  );
}

export function useWidgets() {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error('useWidgets must be used within a WidgetProvider');
  }
  return context;
}

