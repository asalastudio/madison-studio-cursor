import { ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LEDIndicator, type LEDState } from "@/components/darkroom";

interface VideoStudioHeaderProps {
  ledState: LEDState;
  jobLabel: string;
  canDownload: boolean;
  onDownload?: () => void;
}

export function VideoStudioHeader({
  ledState,
  jobLabel,
  canDownload,
  onDownload,
}: VideoStudioHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="dark-room-header">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/create")}
          className="h-8 w-8 p-0 text-[var(--darkroom-text-muted)] hover:bg-white/5 hover:text-[var(--darkroom-text)]"
          aria-label="Back to Create"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="dark-room-header__title">Video</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded border border-white/[0.04] bg-black/20 px-2 py-1">
          <LEDIndicator state={ledState} size="sm" label={jobLabel} />
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
            {jobLabel}
          </span>
        </div>
        {canDownload && onDownload ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            className="h-8 px-3 text-[11px] font-medium text-[var(--darkroom-text-muted)] hover:bg-white/5 hover:text-[var(--darkroom-text)]"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        ) : null}
      </div>
    </header>
  );
}
