/**
 * Content Pipeline Widget
 * 
 * Shows content in progress across different stages.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, FileText, Clock, CheckCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

interface PipelineItem {
  id: string;
  title: string;
  status: 'draft' | 'review' | 'scheduled' | 'published';
  type: string;
  updatedAt: Date;
}

export function ContentPipelineWidget() {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [counts, setCounts] = useState({ draft: 0, review: 0, scheduled: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPipeline = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      try {
        // Get recent master content
        const { data: masterContent } = await supabase
          .from('master_content')
          .select('id, title, status, content_type, updated_at')
          .eq('organization_id', organizationId)
          .eq('is_archived', false)
          .order('updated_at', { ascending: false })
          .limit(10);

        // Get scheduled content
        const { data: scheduledContent } = await supabase
          .from('scheduled_content')
          .select('id, scheduled_date, scheduled_time, status, content_id')
          .eq('organization_id', organizationId)
          .eq('status', 'scheduled')
          .limit(5);

        const pipelineItems: PipelineItem[] = [];
        let draftCount = 0;
        let reviewCount = 0;
        const scheduledCount = scheduledContent?.length || 0;

        if (masterContent) {
          masterContent.forEach(content => {
            const status = content.status as PipelineItem['status'] || 'draft';
            
            if (status === 'draft') draftCount++;
            if (status === 'review') reviewCount++;

            pipelineItems.push({
              id: content.id,
              title: content.title || 'Untitled',
              status,
              type: content.content_type || 'Content',
              updatedAt: new Date(content.updated_at),
            });
          });
        }

        setCounts({ draft: draftCount, review: reviewCount, scheduled: scheduledCount });
        setItems(pipelineItems.slice(0, 5));
      } catch (e) {
        console.error('[ContentPipelineWidget] Error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadPipeline();
  }, [organizationId]);

  const getStatusBadge = (status: PipelineItem['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="text-xs">Draft</Badge>;
      case 'review':
        return <Badge className="text-xs bg-amber-500">Review</Badge>;
      case 'scheduled':
        return <Badge className="text-xs bg-blue-500">Scheduled</Badge>;
      case 'published':
        return <Badge className="text-xs bg-green-500">Published</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
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
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          Content Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden space-y-3">
        {/* Quick Stats */}
        <div className="flex gap-3 text-xs">
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-muted-foreground" />
            <span className="font-medium">{counts.draft}</span>
            <span className="text-muted-foreground">drafts</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-500" />
            <span className="font-medium">{counts.review}</span>
            <span className="text-muted-foreground">review</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="font-medium">{counts.scheduled}</span>
            <span className="text-muted-foreground">scheduled</span>
          </div>
        </div>

        {/* Content List */}
        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">
                No content in pipeline
              </p>
              <button 
                className="text-xs text-primary flex items-center justify-center gap-1"
                onClick={() => navigate('/create')}
              >
                Create Content
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => navigate(`/editor?id=${item.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex-1">
                      {item.title}
                    </span>
                    {getStatusBadge(item.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* View All Link */}
        {items.length > 0 && (
          <button 
            className="text-xs text-primary flex items-center gap-1 hover:gap-2 transition-all"
            onClick={() => navigate('/library')}
          >
            View All Content
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
