import React, { useCallback, useMemo } from 'react';
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor
} from 'react-grid-layout';
import { GripVertical, X, Package, Video, Shield, Palette, Plus, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Import all dashboard components
import { DashboardHero } from './DashboardHero';
import { PipelineOverviewWidget } from './RoleDashboardWidgets';
import { TeamActivityWidget } from './RoleDashboardWidgets';
import { RevenueMetricsWidget } from './RoleDashboardWidgets';
import { ContentPipelineCard } from './ContentPipelineCard';
import { SmartMomentumTracker } from './SmartMomentumTracker';
import { StrategySessionCard } from './StrategySessionCard';
import { QuickLinksWidget } from './QuickLinksWidget';
import { ThisWeekCard } from './ThisWeekCard';
import { DashboardRecentActivity } from './DashboardRecentActivity';
import { RetroTVWidget } from './RetroTVWidget';
import { BrandHealthCard } from './BrandHealthCard';
import { BrandWidget } from './BrandWidget';
import { YellowPadWidget } from './YellowPadWidget';

// Import react-grid-layout styles
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './DashboardGrid.css';

export type DashboardWidgetType =
  | 'hero-banner'
  | 'pipeline-overview'
  | 'team-activity'
  | 'revenue-overview'
  | 'content-pipeline'
  | 'momentum-tracker'
  | 'strategy-session'
  | 'quick-links'
  | 'this-week'
  | 'recent-activity'
  | 'google-meet'
  | 'brand-health'
  | 'brand'
  | 'yellow-pad';

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  w: number;
  h: number;
  x: number;
  y: number;
}

interface DashboardWidgetSystemProps {
  widgets: DashboardWidget[];
  isEditMode: boolean;
  onWidgetsChange: (widgets: DashboardWidget[]) => void;
  onAddWidget: (type: DashboardWidgetType) => void;
  onRemoveWidget: (id: string) => void;
  onResizeWidget: (id: string, w: number, h: number) => void;
  showAddButton?: boolean;
}

const WIDGET_COMPONENTS: Record<DashboardWidgetType, React.ComponentType<any>> = {
  'hero-banner': DashboardHero,
  'pipeline-overview': PipelineOverviewWidget,
  'team-activity': TeamActivityWidget,
  'revenue-overview': RevenueMetricsWidget,
  'content-pipeline': ContentPipelineCard,
  'momentum-tracker': SmartMomentumTracker,
  'strategy-session': StrategySessionCard,
  'quick-links': QuickLinksWidget,
  'this-week': ThisWeekCard,
  'recent-activity': DashboardRecentActivity,
  'google-meet': RetroTVWidget,
  'brand-health': BrandHealthCard,
  'brand': BrandWidget,
  'yellow-pad': YellowPadWidget,
};

export const WIDGET_DEFINITIONS: Record<DashboardWidgetType, { name: string; icon: any; defaultW: number; defaultH: number }> = {
  'hero-banner': { name: 'Hero Banner', icon: Package, defaultW: 10, defaultH: 2 },
  'pipeline-overview': { name: 'Product Pipeline', icon: Package, defaultW: 4, defaultH: 3 },
  'team-activity': { name: 'Team Activity', icon: Package, defaultW: 4, defaultH: 3 },
  'revenue-overview': { name: 'Revenue Overview', icon: Package, defaultW: 4, defaultH: 3 },
  'content-pipeline': { name: 'Content Pipeline', icon: Package, defaultW: 6, defaultH: 4 },
  'momentum-tracker': { name: 'Momentum Tracker', icon: Package, defaultW: 6, defaultH: 4 },
  'strategy-session': { name: 'Strategy Session', icon: Package, defaultW: 2, defaultH: 2 },
  'quick-links': { name: 'Quick Links', icon: Package, defaultW: 8, defaultH: 2 },
  'this-week': { name: "This Week's Schedule", icon: Package, defaultW: 12, defaultH: 3 },
  'recent-activity': { name: 'Recent Activity', icon: Package, defaultW: 12, defaultH: 4 },
  'google-meet': { name: 'Google Meet', icon: Video, defaultW: 4, defaultH: 3 },
  'brand-health': { name: 'Brand Health', icon: Shield, defaultW: 4, defaultH: 3 },
  'brand': { name: 'Brand', icon: Palette, defaultW: 4, defaultH: 3 },
  'yellow-pad': { name: 'Yellow Pad', icon: ScrollText, defaultW: 4, defaultH: 5 },
};

export function DashboardWidgetSystem({
  widgets,
  isEditMode,
  onWidgetsChange,
  onAddWidget,
  onRemoveWidget,
  showAddButton = true,
}: DashboardWidgetSystemProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  // Create the layout for react-grid-layout
  const layout = useMemo(() => {
    return widgets.map(w => ({
      i: w.id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      // Constraints
      minW: w.type === 'hero-banner' ? 6 : 2,
      minH: 1,
      static: !isEditMode && w.type === 'hero-banner'
    }));
  }, [widgets, isEditMode]);

  const onLayoutChange = useCallback((newLayout: any) => {
    // Only process layout changes when in edit mode - prevents react-grid-layout from
    // overwriting saved layout on initial mount / resize (known RGL behavior)
    if (!isEditMode) return;

    const updatedWidgets = widgets.map(w => {
      const layoutItem = newLayout.find((item: any) => item.i === w.id);
      if (layoutItem) {
        return {
          ...w,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        };
      }
      return w;
    });

    const hasChanged = updatedWidgets.some((w, index) => {
      const original = widgets[index];
      return original && (w.x !== original.x || w.y !== original.y || w.w !== original.w || w.h !== original.h);
    });

    if (hasChanged) {
      onWidgetsChange(updatedWidgets);
    }
  }, [widgets, isEditMode, onWidgetsChange]);

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Optional Add Widget Action Bar (only if enabled and in edit mode) */}
      {isEditMode && showAddButton && (
        <div className="flex justify-end p-2 bg-white/50 rounded-lg border border-dashed border-[#B8956A]/30">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/10">
                <Plus className="w-4 h-4" />
                Add Widget
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2">
              <DropdownMenuLabel className="px-2 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Available Dashlets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup className="space-y-1">
                {Object.entries(WIDGET_DEFINITIONS).map(([type, def]) => {
                  const Icon = def.icon;
                  const isAdded = widgets.some(w => w.type === type);
                  if (type === 'hero-banner') return null;
                  return (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => onAddWidget(type as DashboardWidgetType)}
                      disabled={isAdded}
                      className="gap-3 py-2 px-2 rounded-md transition-colors cursor-pointer"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#B8956A]/10 text-[#B8956A]">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{def.name}</span>
                        {isAdded && <span className="text-[10px] text-muted-foreground">Already on dashboard</span>}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className={cn(
        "relative transition-all duration-500 rounded-xl overflow-hidden",
        isEditMode ? "dashboard-grid-editing p-8 ring-1 ring-[#B8956A]/30 bg-[#FBFAF8] shadow-2xl scale-[0.99] origin-top" : "p-0"
      )}>
        {isEditMode && (
          <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none z-[70]">
            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md border border-[#B8956A]/30 px-4 py-2 rounded-full shadow-lg">
              <div className="w-2 h-2 rounded-full bg-[#B8956A] animate-pulse" />
              <span className="text-[11px] font-bold text-[#B8956A] uppercase tracking-widest">
                Architectural Mode: Drafting Workspace
              </span>
            </div>
          </div>
        )}

        {mounted ? (
          <ResponsiveGridLayout
            width={width}
            className="layout"
            layouts={{ lg: layout, md: layout, sm: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={80}
            margin={[16, 16]}
            onLayoutChange={onLayoutChange}
            dragConfig={{
              enabled: isEditMode,
              handle: '.drag-handle'
            }}
            resizeConfig={{
              enabled: isEditMode
            }}
            compactor={verticalCompactor}
          >
            {widgets.map(widget => {
              const Component = WIDGET_COMPONENTS[widget.type];
              if (!Component) return <div key={widget.id} />;

              return (
                <div
                  key={widget.id}
                  className={cn(
                    "group relative bg-white rounded-xl shadow-sm border border-[#E0E0E0] overflow-hidden flex flex-col transition-shadow hover:shadow-md",
                    isEditMode && "edit-mode-ring cursor-default hover:shadow-lg"
                  )}
                >
                  {/* Drag Handle & Controls Overlay (Only in Edit Mode) */}
                  {isEditMode && (
                    <div className="absolute inset-x-0 top-0 h-10 z-[60] flex items-center justify-between px-3 pointer-events-none bg-white/40 backdrop-blur-sm border-b border-black/5">
                      <div className="drag-handle p-1.5 rounded-md bg-white shadow-md border border-[#E0E0E0] cursor-grab active:cursor-grabbing pointer-events-auto hover:bg-[#F5F5F5] transition-colors">
                        <GripVertical className="w-4 h-4 text-[#B8956A]" />
                      </div>

                      <div className="flex items-center gap-2 pointer-events-auto">
                        <div className="text-[9px] font-bold tracking-tighter text-[#B8956A] bg-white px-2 py-0.5 rounded-full border border-[#E0E0E0] uppercase">
                          {widget.w}w × {widget.h}h
                        </div>
                        {widget.type !== 'hero-banner' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveWidget(widget.id);
                            }}
                            className="p-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-colors shadow-sm"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "flex-1 min-h-0 transition-opacity duration-300",
                    isEditMode && "opacity-80 pointer-events-none grayscale-[0.05]"
                  )}>
                    {widget.type === 'strategy-session' || widget.type === 'brand-health' ? (
                      <Component compact />
                    ) : (
                      <Component />
                    )}
                  </div>

                  {/* Edit Mode Overlay Gradient */}
                  {isEditMode && (
                    <div className="absolute inset-0 bg-gradient-to-b from-[#B8956A]/5 to-transparent pointer-events-none" />
                  )}
                </div>
              );
            })}
          </ResponsiveGridLayout>
        ) : (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-pulse text-[#B8956A]/40 font-medium">Initializing Workspace...</div>
          </div>
        )}
      </div>
    </div>
  );
}
