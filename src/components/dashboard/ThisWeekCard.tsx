import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";

export function ThisWeekCard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useDashboardStats();

  // Generate current week dates (Sunday to Saturday)
  const weekDays = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - currentDay);
    startOfWeek.setHours(0, 0, 0, 0);

    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      
      const dateKey = date.toISOString().split('T')[0]; // yyyy-MM-dd
      const scheduledCount = stats?.scheduledDays?.[dateKey] || 0;
      
      // Create dots based on scheduled count (max 3 dots shown)
      const dots = [];
      for (let j = 0; j < Math.min(scheduledCount, 3); j++) {
        dots.push({ color: "#B8956A" }); // Brass color for scheduled
      }

      const isToday = date.toDateString() === now.toDateString();
      
      days.push({
        day: dayNames[i],
        date: date.getDate().toString(),
        fullDate: date,
        dateKey,
        dots,
        isToday,
        scheduledCount,
      });
    }

    return days;
  }, [stats?.scheduledDays]);

  // Calculate total scheduled this week
  const totalScheduled = weekDays.reduce((sum, day) => sum + day.scheduledCount, 0);

  if (isLoading) {
    return (
      <div className="col-span-1 md:col-span-12">
        <Skeleton className="h-[180px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="col-span-1 md:col-span-12">
      <Card className="flex h-full max-w-full flex-col overflow-x-hidden border border-[#E0E0E0] bg-white p-4 transition-all duration-200 hover-lift md:p-6">
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <h3 className="text-sm font-medium text-[#1C150D]/60">This Week</h3>
          {totalScheduled > 0 && (
            <span className="text-xs text-[#1C150D]/50">
              {totalScheduled} scheduled
            </span>
          )}
        </div>
        
        {/* Mobile: Horizontal Scroll */}
        <div className="scrollbar-hide max-w-full overflow-x-auto md:hidden">
          <div className="flex min-w-max gap-3 pb-2">
            {weekDays.map((day, index) => (
              <div
                key={index}
                onClick={() => navigate("/calendar")}
                className={`flex flex-col items-center p-3 rounded-lg transition-colors cursor-pointer border min-w-[70px] ${
                  day.isToday 
                    ? 'bg-[#B8956A]/10 border-[#B8956A]/30' 
                    : 'border-transparent hover:bg-[#FAFAFA] hover:border-[#E0E0E0]'
                }`}
              >
                <span className={`text-xs font-medium mb-1 ${
                  day.isToday ? 'text-[#B8956A]' : 'text-[#1C150D]/40'
                }`}>
                  {day.day}
                </span>
                <span className={`text-2xl font-semibold mb-3 ${
                  day.isToday ? 'text-[#B8956A]' : 'text-[#1C150D]'
                }`}>
                  {day.date}
                </span>
                <div className="flex gap-1.5 flex-wrap justify-center min-h-[16px]">
                  {day.dots.length > 0 ? (
                    day.dots.map((dot, dotIndex) => (
                      <div
                        key={dotIndex}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: dot.color }}
                      />
                    ))
                  ) : (
                    <div className="w-2 h-2" /> // Spacer for alignment
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: Grid */}
        <div className="hidden md:grid grid-cols-7 gap-3">
          {weekDays.map((day, index) => (
            <div
              key={index}
              onClick={() => navigate("/calendar")}
              className={`flex flex-col items-center p-3 rounded-lg transition-all cursor-pointer border ${
                day.isToday 
                  ? 'bg-[#B8956A]/10 border-[#B8956A]/30 shadow-sm' 
                  : 'border-transparent hover:bg-[#FAFAFA] hover:border-[#E0E0E0]'
              }`}
            >
              <span className={`text-xs font-medium mb-1 ${
                day.isToday ? 'text-[#B8956A]' : 'text-[#1C150D]/40'
              }`}>
                {day.day}
              </span>
              <span className={`text-xl font-semibold mb-3 ${
                day.isToday ? 'text-[#B8956A]' : 'text-[#1C150D]'
              }`}>
                {day.date}
              </span>
              <div className="flex gap-1 flex-wrap justify-center min-h-[16px]">
                {day.dots.length > 0 ? (
                  day.dots.map((dot, dotIndex) => (
                    <div
                      key={dotIndex}
                      className="w-2 h-2 rounded-full transition-transform hover:scale-125"
                      style={{ backgroundColor: dot.color }}
                    />
                  ))
                ) : (
                  <div className="w-2 h-2" /> // Spacer for alignment
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Empty State / CTA */}
        {totalScheduled === 0 && (
          <div className="mt-4 pt-4 border-t border-[#E0E0E0] text-center">
            <p className="text-sm text-[#1C150D]/50 mb-3">
              No content scheduled this week. Plan ahead?
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/calendar")}
              className="w-full max-w-full whitespace-normal text-[#B8956A] border-[#B8956A]/30 hover:bg-[#B8956A]/10"
            >
              Schedule Content →
            </Button>
          </div>
        )}

        {/* View Calendar Link */}
        {totalScheduled > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => navigate("/calendar")}
              className="text-xs text-[#B8956A] hover:text-[#A3865A] transition-colors"
            >
              View Full Calendar →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
