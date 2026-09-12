import { useState, useEffect } from "react";
import { addMonths, subMonths, format } from "date-fns";
import { DragDropContext, DropResult } from "react-beautiful-dnd";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { ScheduleModal } from "@/components/calendar/ScheduleModal";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { MobileCalendarSheet } from "@/components/calendar/MobileCalendarSheet";
import { Button } from "@/components/ui/button";
import { Plus, Share2 } from "lucide-react";
import { SocialComposer } from "@/components/social/SocialComposer";
import { SocialQueuePanel } from "@/components/social/SocialQueuePanel";
import { useSocialPosts } from "@/hooks/useSocialPosts";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Calendar = () => {
  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "agenda">(isMobile ? "agenda" : "month");
  const [scheduledItems, setScheduledItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<Date | null>(null);
  const { invalidate: refreshSocialQueue } = useSocialPosts();



  useEffect(() => {
    fetchScheduledContent();
  }, [currentDate, user, currentOrganizationId]);

  const fetchScheduledContent = async () => {
    if (!user || !currentOrganizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("scheduled_content")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .neq("status", "cancelled")
        .order("scheduled_date", { ascending: true });

      if (error) throw error;
      setScheduledItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading schedule",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMonth = () => {
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedItem(null);
    setScheduleModalOpen(true);
  };

  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    setSelectedDate(undefined);
    setScheduleModalOpen(true);
  };

  const handleNewSchedule = () => {
    setSelectedDate(new Date());
    setSelectedItem(null);
    setScheduleModalOpen(true);
  };

  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);
    const { draggableId, destination } = result;

    if (!destination) return;

    const itemId = draggableId;
    const newDateStr = destination.droppableId;

    // Find the item being moved
    const item = scheduledItems.find(i => i.id === itemId);
    if (!item) return;

    // Optimistic update - update UI immediately
    setScheduledItems(prev =>
      prev.map(i => i.id === itemId ? { ...i, scheduled_date: newDateStr } : i)
    );

    try {
      // Update database in background
      const { error } = await supabase
        .from("scheduled_content")
        .update({ scheduled_date: newDateStr })
        .eq("id", itemId);

      if (error) throw error;

      // Get user and sync settings in parallel
      const [{ data: { user } }, { data: syncSettings }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('google_calendar_sync')
          .select('sync_enabled')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
          .maybeSingle()
      ]);

      // Sync to Google Calendar if enabled (fire and forget)
      if (syncSettings?.sync_enabled && item.google_event_id && user) {
        supabase.functions.invoke('sync-to-google-calendar', {
          body: {
            operation: 'update',
            scheduledContentId: itemId,
            eventData: {
              title: item.title,
              date: newDateStr,
              time: item.scheduled_time || undefined,
              notes: item.notes || undefined,
              platform: item.platform || undefined,
            },
            googleEventId: item.google_event_id,
          },
        }).catch(err => console.error('Google sync failed:', err));
      }

      toast({
        title: "Moved",
        description: syncSettings?.sync_enabled ? "Event moved and syncing to Google Calendar" : "Event moved successfully",
      });
    } catch (error: any) {
      // Revert optimistic update on error
      setScheduledItems(prev =>
        prev.map(i => i.id === itemId ? { ...i, scheduled_date: item.scheduled_date } : i)
      );

      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen pb-12 pt-4 md:pt-8">
      <div className={cn(
        "max-w-[1920px] mx-auto",
        isMobile ? "px-3" : "px-4 md:px-12"
      )}>
        <CalendarHeader
          currentDate={currentDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
          isMobile={isMobile}
        />

        {/* Desktop Schedule Button */}
        {!isMobile && (
          <div className="mt-6 flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleNewSchedule}
                  variant="brass"
                  className="gap-2"
                  data-tooltip-target="schedule-button"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Content
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add new content to your calendar</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    setComposerDate(new Date());
                    setComposerOpen(true);
                  }}
                  variant="outline"
                  className="gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Post to social
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Publish or schedule to your connected social accounts</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <DragDropContext
          onDragStart={() => setIsDragging(true)}
          onDragEnd={handleDragEnd}
        >
          <div className={cn("mt-6", isMobile && "mt-4")}>
            {/* Calendar Section */}
            <div className="w-full">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-base text-muted-foreground">Loading calendar...</div>
                </div>
              ) : (
                <div>
                  {viewMode === "agenda" ? (
                    <AgendaView
                      currentDate={currentDate}
                      scheduledItems={scheduledItems}
                      onItemClick={handleItemClick}
                    />
                  ) : viewMode === "month" ? (
                    <MonthView
                      currentDate={currentDate}
                      scheduledItems={scheduledItems}
                      onDayClick={handleDayClick}
                      onItemClick={handleItemClick}
                      isDragging={isDragging}
                      isMobile={isMobile}
                    />
                  ) : (
                    <WeekView
                      currentDate={currentDate}
                      scheduledItems={scheduledItems}
                      onItemClick={handleItemClick}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </DragDropContext>

        <div className={cn("mt-6", isMobile && "mt-4")}>
          <SocialQueuePanel />
        </div>

        {/* Mobile FAB */}
        {isMobile && (
          <Button
            onClick={handleNewSchedule}
            size="lg"
            className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-50 animate-scale-in"
          >
            <Plus className="w-6 h-6" />
          </Button>
        )}

        <ScheduleModal
          open={scheduleModalOpen}
          onOpenChange={(open) => {
            setScheduleModalOpen(open);
            if (!open) {
              setSelectedItem(null);
              setSelectedDate(undefined);
            }
          }}
          selectedDate={selectedDate}
          itemToEdit={selectedItem}
          onSuccess={fetchScheduledContent}
        />

        <SocialComposer
          open={composerOpen}
          onOpenChange={setComposerOpen}
          initialScheduledFor={composerDate}
          onPublished={() => {
            refreshSocialQueue();
            fetchScheduledContent();
          }}
        />
      </div>
    </div>
  );
};

export default Calendar;
