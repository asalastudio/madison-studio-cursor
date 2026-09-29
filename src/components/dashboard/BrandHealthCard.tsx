import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useBrandHealth } from "@/hooks/useBrandHealth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BrandQuickViewTrigger } from "@/components/brand";

interface BrandHealthCardProps {
  compact?: boolean;
}

export function BrandHealthCard({ compact = false }: BrandHealthCardProps) {
  const navigate = useNavigate();
  const { brandHealth, isLoading: healthLoading } = useBrandHealth();

  // Collapse state - default collapsed for returning users
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    const hasVisited = localStorage.getItem('dashboard-visited');
    return !hasVisited; // Expand on first visit, collapse after
  });

  // Mark dashboard as visited
  useEffect(() => {
    localStorage.setItem('dashboard-visited', 'true');
  }, []);

  const brandScore = brandHealth?.completeness_score;

  const getBrandHealthColor = (score: number) => {
    if (score >= 90) return "text-[#A3C98D]";
    if (score >= 70) return "text-[#F5C16C]";
    return "text-[#E67E73]";
  };

  const getRating = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    return "Needs Attention";
  };

  const scored = typeof brandScore === "number";
  const displayScore = scored ? brandScore : null;

  if (healthLoading) {
    return (
      <div className="bg-white border border-[#E0E0E0] rounded-lg">
        <Skeleton className="min-h-[120px] rounded-lg skeleton-shimmer" />
      </div>
    );
  }

  // Compact mode - vertical layout for sidebar position
  if (compact) {
    return (
      <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden transition-all duration-300 flex flex-col hover-lift">
        {/* Header - Always Visible & Clickable */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 text-left flex flex-col items-center hover:bg-[#FAFAFA] transition-colors touch-manipulation"
        >
          {/* Circular Progress - Centered */}
          <div className="relative w-14 h-14 mb-2">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                stroke="#F0F0F0"
                strokeWidth="5"
                fill="none"
              />
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                stroke="var(--aged-brass-hex)"
                strokeWidth="5"
                fill="none"
                strokeDasharray={`${((displayScore ?? 0) / 100) * 226.2} 226.2`}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-semibold text-[#1C150D]">{displayScore ?? "—"}</span>
            </div>
          </div>

          {/* Title & Rating - Centered */}
          <div className="text-center flex items-center gap-2">
            <h3 className="text-xs font-medium text-[#1C150D]/60">Brand Health</h3>
            <span className="text-xs text-[#1C150D]/30">•</span>
            <p className={`text-xs font-semibold ${scored ? getBrandHealthColor(brandScore) : "text-[#1C150D]/50"}`}>
              {scored ? getRating(brandScore) : "Not scored"}
            </p>
            <ChevronDown 
              className={`w-3 h-3 text-[#1C150D]/40 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* Expanded Section - Category Breakdown */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2 border-t border-[#E0E0E0] pt-2 animate-in slide-in-from-top-2 duration-200">
            <p className="text-xs text-[#1C150D]/60">
              {scored
                ? "Overall completeness from your last brand-health analysis."
                : "Run a brand-health analysis to see a real score."}
            </p>
            <div className="flex gap-2 mt-2">
              <BrandQuickViewTrigger variant="minimal" className="flex-1 text-xs" />
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/brand-health");
                }}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Full Report
              </Button>
            </div>
          </div>
        )}

        {/* Collapsed View - Show View Report Link */}
        {!isExpanded && (
          <div className="flex-1 flex items-end p-4 pt-0">
            <button
              onClick={() => navigate("/brand-health")}
              className="w-full text-xs text-[#B8956A] hover:text-[#A3865A] transition-colors text-center"
            >
              View Full Report →
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full width mode - horizontal layout (original)
  return (
    <div className="col-span-1 md:col-span-4 bg-white border border-[#E0E0E0] rounded-lg overflow-hidden transition-all duration-300 hover-lift">
      {/* Collapsed Header - Always Visible & Clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 md:p-6 text-left flex items-center justify-between hover:bg-[#FAFAFA] transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-4 md:gap-6">
          {/* Circular Progress */}
          <div className="relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                stroke="#F0F0F0"
                strokeWidth="5"
                fill="none"
              />
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                stroke="var(--aged-brass-hex)"
                strokeWidth="5"
                fill="none"
                strokeDasharray={`${((displayScore ?? 0) / 100) * 226.2} 226.2`}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg md:text-xl font-semibold text-[#1C150D]">{displayScore ?? "—"}</span>
            </div>
          </div>

          {/* Title & Rating */}
          <div>
            <h3 className="text-sm font-medium text-[#1C150D]/60 mb-1">Brand Health</h3>
            <p className={`text-base md:text-lg font-semibold ${scored ? getBrandHealthColor(brandScore) : "text-[#1C150D]/50"}`}>
              {scored ? getRating(brandScore) : "Not scored"}
            </p>
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        <ChevronDown 
          className={`w-5 h-5 text-[#1C150D]/40 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded Section - Category Breakdown */}
      {isExpanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-4 border-t border-[#E0E0E0] pt-4 animate-in slide-in-from-top-2 duration-200">
          <p className="text-sm text-[#1C150D]/60">
            {scored
              ? "This is the overall completeness score from your last analysis. Sub-scores will appear here when they are measured for real."
              : "No analysis yet. Open the full report to run brand health."}
          </p>
          <div className="pt-4 border-t border-[#E0E0E0]">
            <Button
              variant="outline"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/brand-health");
              }}
            >
              📄 View Living Brand Report →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
