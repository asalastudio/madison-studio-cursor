import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface DashboardStats {
  totalContent: number;
  piecesCreatedThisWeek: number;
  piecesPublished: number;
  piecesScheduled: number;
  onBrandScore: number;
  streakDays: number;
  recentActivity: RecentActivityItem[];
  totalDrafts: number;
  createdWeekChange: number;
  publishedWeekChange: number;
  scheduledWeekChange: number;
  // NEW: Dashboard redesign fields
  weeklyGoal: number;
  scheduledDays: Record<string, number>; // date string (yyyy-MM-dd) -> count
  recentMaster: RecentMasterContent | null;
  aiSuggestion: AISuggestion | null;
  weekEndsIn: number; // days until end of week
}

export interface RecentMasterContent {
  id: string;
  title: string;
  derivativeCount: number;
  createdAt: string;
}

export interface AISuggestion {
  text: string;
  cta: string;
  route: string;
  priority: 'multiply' | 'schedule' | 'brand' | 'create';
}

export interface RecentActivityItem {
  id: string;
  title: string;
  type: string;
  action: string;
  time: string;
  category: 'master' | 'output' | 'derivative';
  created_at: string;
}

export function useDashboardStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dashboard-stats", user?.id],
    queryFn: async (): Promise<DashboardStats> => {
      const defaultStats: DashboardStats = {
        totalContent: 0,
        piecesCreatedThisWeek: 0,
        piecesPublished: 0,
        piecesScheduled: 0,
        onBrandScore: 95,
        streakDays: 0,
        recentActivity: [],
        totalDrafts: 0,
        createdWeekChange: 0,
        publishedWeekChange: 0,
        scheduledWeekChange: 0,
        // NEW: Dashboard redesign defaults
        weeklyGoal: 5, // Default goal
        scheduledDays: {},
        recentMaster: null,
        aiSuggestion: null,
        weekEndsIn: 0,
      };

      try {
        if (!user) {
          return defaultStats;
        }

        // Get user's organization (non-throwing)
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!orgMember) {
          // New users won't have an org yet; resolve immediately to avoid spinners
          return defaultStats;
        }

        const organizationId = orgMember.organization_id;

        // Get start of current week (Sunday) in UTC to match database timestamps
        const now = new Date();
        const currentDayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const startOfWeek = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - currentDayOfWeek,
          0, 0, 0, 0
        ));

        // Get start of previous week in UTC
        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setUTCDate(startOfWeek.getUTCDate() - 7);

        // Fetch brand health score
        const { data: brandHealth } = await supabase
          .from("brand_health")
          .select("completeness_score")
          .eq("organization_id", organizationId)
          .maybeSingle();

        // Fetch master content
        const { data: masterContent } = await supabase
          .from("master_content")
          .select("id, title, created_at, content_type, status, quality_rating")
          .eq("organization_id", organizationId)
          .eq("is_archived", false);

        // Fetch outputs
        const { data: outputs } = await supabase
          .from("outputs")
          .select("id, created_at, quality_rating")
          .eq("organization_id", organizationId)
          .eq("is_archived", false);

        // Fetch derivative assets
        const { data: derivatives } = await supabase
          .from("derivative_assets")
          .select("id, title: asset_type, created_at, asset_type, approval_status, quality_rating")
          .eq("organization_id", organizationId)
          .eq("is_archived", false);

        // Fetch scheduled content with dates for calendar
        const { data: scheduled } = await supabase
          .from("scheduled_content")
          .select("id, scheduled_for")
          .eq("organization_id", organizationId)
          .eq("status", "scheduled");

        // Fetch organization settings for weeklyGoal
        const { data: orgData } = await supabase
          .from("organizations")
          .select("settings")
          .eq("id", organizationId)
          .maybeSingle();

        // Fetch derivative counts for recent master content
        const { data: derivativeCounts } = await supabase
          .from("derivative_assets")
          .select("master_content_id")
          .eq("organization_id", organizationId)
          .eq("is_archived", false);

        // Calculate stats
        const totalContent = 
          (masterContent?.length || 0) + 
          (outputs?.length || 0) + 
          (derivatives?.length || 0);

        const allContent = [
          ...(masterContent || []),
          ...(outputs || []),
          ...(derivatives || []),
        ];

        const piecesCreatedThisWeek = allContent.filter(
          item => new Date(item.created_at) >= startOfWeek
        ).length;

        const piecesCreatedLastWeek = allContent.filter(
          item => {
            const date = new Date(item.created_at);
            return date >= startOfLastWeek && date < startOfWeek;
          }
        ).length;

        const piecesPublished = (masterContent || []).filter(
          item => item.status === "published"
        ).length;

        const piecesPublishedLastWeek = (masterContent || []).filter(
          item => {
            const publishedAt = item.status === "published" ? item.created_at : null;
            if (!publishedAt) return false;
            const date = new Date(publishedAt);
            return date >= startOfLastWeek && date < startOfWeek;
          }
        ).length;

        const piecesScheduled = scheduled?.length || 0;

        // For scheduled, we compare current count to what it was 7 days ago
        // (This is an approximation - ideally we'd track historical scheduled counts)
        const scheduledLastWeek = Math.max(0, piecesScheduled - Math.floor(piecesScheduled * 0.15));

        // Calculate total drafts (only master content in draft status)
        const totalDrafts = (masterContent || []).filter(
          item => item.status === "draft"
        ).length;

        // Use brand health score (from brand guidelines completeness analysis)
        const onBrandScore = brandHealth?.completeness_score ?? defaultStats.onBrandScore;

        // Calculate streak (simplified - just count days with activity in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        
        const recentDates = [
          ...(masterContent || []),
          ...(outputs || []),
          ...(derivatives || []),
        ]
          .filter(item => new Date(item.created_at) >= thirtyDaysAgo)
          .map(item => new Date(item.created_at).toDateString());

        const uniqueDates = new Set(recentDates);
        const streakDays = Math.min(uniqueDates.size, 30);

        // Get recent activity (last 5 items)
        const allActivity: RecentActivityItem[] = [
          ...(masterContent || []).map(item => ({
            id: item.id,
            title: item.title,
            type: item.content_type,
            action: item.status === "published" ? "Published" : "Created",
            time: getTimeAgo(item.created_at),
            category: 'master' as const,
            created_at: item.created_at,
          })),
          ...(outputs || []).map(item => ({
            id: item.id,
            title: "Output Content",
            type: "output",
            action: "Generated",
            time: getTimeAgo(item.created_at),
            category: 'output' as const,
            created_at: item.created_at,
          })),
          ...(derivatives || []).map(item => ({
            id: item.id,
            title: item.title || item.asset_type,
            type: item.asset_type,
            action: item.approval_status === "approved" ? "Approved" : "Created",
            time: getTimeAgo(item.created_at),
            category: 'derivative' as const,
            created_at: item.created_at,
          })),
        ];

        const recentActivity = allActivity
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        // Calculate percentage changes
        const calculateChange = (current: number, previous: number): number => {
          if (previous === 0) return current > 0 ? 100 : 0;
          return Math.round(((current - previous) / previous) * 100);
        };

        // NEW: Calculate weeklyGoal from organization settings
        const weeklyGoal = (orgData?.settings as any)?.weeklyGoal ?? 5;

        // NEW: Calculate scheduledDays (group scheduled content by date)
        const scheduledDays: Record<string, number> = {};
        (scheduled || []).forEach(item => {
          if (item.scheduled_for) {
            const dateKey = new Date(item.scheduled_for).toISOString().split('T')[0];
            scheduledDays[dateKey] = (scheduledDays[dateKey] || 0) + 1;
          }
        });

        // NEW: Calculate weekEndsIn (days until Sunday)
        const daysUntilSunday = 7 - now.getUTCDay();
        const weekEndsIn = daysUntilSunday === 7 ? 0 : daysUntilSunday;

        // NEW: Get most recent master content with derivative count
        let recentMaster: RecentMasterContent | null = null;
        if (masterContent && masterContent.length > 0) {
          // Sort by created_at descending and get most recent
          const sortedMaster = [...masterContent].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const latestMaster = sortedMaster[0];
          
          // Count derivatives for this master content
          const derivativeCount = (derivativeCounts || []).filter(
            d => d.master_content_id === latestMaster.id
          ).length;

          recentMaster = {
            id: latestMaster.id,
            title: latestMaster.title,
            derivativeCount,
            createdAt: latestMaster.created_at,
          };
        }

        // NEW: Generate AI suggestion based on stats
        const generateAISuggestion = (): AISuggestion | null => {
          // Priority 1: If recent master has no derivatives, suggest multiply
          if (recentMaster && recentMaster.derivativeCount === 0) {
            return {
              text: `Turn "${recentMaster.title}" into an Instagram carousel`,
              cta: 'Multiply Now',
              route: `/multiply?id=${recentMaster.id}`,
              priority: 'multiply',
            };
          }

          // Priority 2: If no scheduled content this week, suggest scheduling
          const thisWeekScheduled = Object.entries(scheduledDays).filter(([date]) => {
            const d = new Date(date);
            return d >= startOfWeek;
          }).reduce((sum, [, count]) => sum + count, 0);

          if (thisWeekScheduled === 0) {
            return {
              text: 'You have no content scheduled this week. Plan ahead?',
              cta: 'Schedule Content',
              route: '/calendar',
              priority: 'schedule',
            };
          }

          // Priority 3: If brand health < 85%, suggest improving it
          if (onBrandScore < 85) {
            return {
              text: `Improve your Brand Health to 85%+ for better content quality`,
              cta: 'Review Gaps',
              route: '/brand-health',
              priority: 'brand',
            };
          }

          // Priority 4: If behind on weekly goal, encourage creation
          const deficit = weeklyGoal - piecesCreatedThisWeek;
          if (deficit > 0 && weekEndsIn <= 3) {
            return {
              text: `Create ${deficit} more piece${deficit > 1 ? 's' : ''} to hit your weekly goal`,
              cta: 'Start Creating',
              route: '/create',
              priority: 'create',
            };
          }

          // Default: Encourage creation
          return {
            text: 'Ready to write your next masterpiece?',
            cta: 'Start Creating',
            route: '/create',
            priority: 'create',
          };
        };

        const aiSuggestion = generateAISuggestion();

        return {
          totalContent,
          piecesCreatedThisWeek,
          piecesPublished,
          piecesScheduled,
          onBrandScore,
          streakDays,
          recentActivity,
          totalDrafts,
          createdWeekChange: calculateChange(piecesCreatedThisWeek, piecesCreatedLastWeek),
          publishedWeekChange: calculateChange(piecesPublished, piecesPublishedLastWeek),
          scheduledWeekChange: calculateChange(piecesScheduled, scheduledLastWeek),
          // NEW: Dashboard redesign fields
          weeklyGoal,
          scheduledDays,
          recentMaster,
          aiSuggestion,
          weekEndsIn,
        };
      } catch (e) {
        // Any failure should not block UI
        return defaultStats;
      }
    },
    enabled: !!user,
    retry: 0,
    staleTime: 1000 * 60 * 2, // Increased to 2 minutes to reduce refetches
  });
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "Yesterday";
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
