/**
 * This Week Widget
 * 
 * Shows scheduled content for the current week.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Linkedin, Instagram, Mail, FileText, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { format, startOfWeek, endOfWeek, isToday, isTomorrow } from 'date-fns';

interface ScheduledItem {
  id: string;
  title: string;
  scheduledFor: Date;
  platform: string;
  type: string;
}

export function ThisWeekWidget() {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSchedule = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      try {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

        const { data } = await supabase
          .from('scheduled_content')
          .select(`
            id,
            scheduled_date,
            scheduled_time,
            status,
            platform,
            content_type,
            master_content:content_id (title),
            derivative_assets:derivative_id (asset_type, platform_specs)
          `)
          .eq('organization_id', organizationId)
          .eq('status', 'scheduled')
          .gte('scheduled_date', format(weekStart, 'yyyy-MM-dd'))
          .lte('scheduled_date', format(weekEnd, 'yyyy-MM-dd'))
          .order('scheduled_date', { ascending: true })
          .order('scheduled_time', { ascending: true })
          .limit(10);

        if (data) {
          const scheduledItems: ScheduledItem[] = data.map(item => ({
            id: item.id,
            title: item.master_content?.title || 
                   (item.derivative_assets?.platform_specs as any)?.title || 
                   'Scheduled Content',
            scheduledFor: new Date(`${item.scheduled_date}T${item.scheduled_time ?? '00:00:00'}`),
            platform: item.platform || item.derivative_assets?.asset_type || 'Content',
            type: item.content_type || 'Post',
          }));

          setItems(scheduledItems);
        }
      } catch (e) {
        console.error('[ThisWeekWidget] Error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadSchedule();
  }, [organizationId]);

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('linkedin')) return <Linkedin className="w-3 h-3 text-blue-600" />;
    if (p.includes('instagram')) return <Instagram className="w-3 h-3 text-pink-600" />;
    if (p.includes('email')) return <Mail className="w-3 h-3 text-green-600" />;
    return <FileText className="w-3 h-3 text-muted-foreground" />;
  };

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE');
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="h-full flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            This Week
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {items.length} scheduled
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Calendar className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Nothing scheduled this week
            </p>
            <button 
              className="text-xs text-primary flex items-center gap-1"
              onClick={() => navigate('/calendar')}
            >
              Open Calendar
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex gap-2 pb-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex-shrink-0 w-40 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => navigate('/calendar')}
                >
                  {/* Date */}
                  <div className="flex items-center gap-1 mb-2">
                    <span className={`text-xs font-medium ${
                      isToday(item.scheduledFor) ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {getDateLabel(item.scheduledFor)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(item.scheduledFor, 'h:mm a')}
                    </span>
                  </div>
                  
                  {/* Title */}
                  <p className="text-sm font-medium line-clamp-2 mb-2">
                    {item.title}
                  </p>
                  
                  {/* Platform */}
                  <div className="flex items-center gap-1">
                    {getPlatformIcon(item.platform)}
                    <span className="text-xs text-muted-foreground truncate">
                      {item.platform}
                    </span>
                  </div>
                </div>
              ))}
              
              {/* View All Card */}
              <div
                className="flex-shrink-0 w-32 p-3 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer flex flex-col items-center justify-center text-center"
                onClick={() => navigate('/calendar')}
              >
                <Calendar className="w-5 h-5 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">View Calendar</span>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
