/**
 * VideoScriptResults Component
 *
 * Displays generated video prompts (Hero, Reel, Story)
 * with copy buttons and duration indicators.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, RefreshCw, Film, Clock, Video, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VideoScriptOutput, ContentAnalysis } from "@/lib/agents/contentToVisualPrompts";

interface VideoScriptResultsProps {
  videos: VideoScriptOutput;
  analysis: ContentAnalysis;
  onRegenerate?: (type: 'hero' | 'reel' | 'story') => void;
  isRegenerating?: boolean;
}

export function VideoScriptResults({
  videos,
  analysis,
  onRegenerate,
  isRegenerating
}: VideoScriptResultsProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (prompt: string, id: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    toast({
      title: "Prompt copied",
      description: "Video prompt copied to clipboard",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const videoConfigs = [
    {
      key: 'hero' as const,
      title: 'Hero Video',
      data: videos.hero,
      aspectPreview: 'aspect-video', // 16:9
      bgColor: 'bg-gradient-to-br from-purple-900 to-indigo-900',
      icon: Film,
    },
    {
      key: 'reel' as const,
      title: 'Social Reel',
      data: videos.reel,
      aspectPreview: 'aspect-[9/16]', // 9:16 vertical
      bgColor: 'bg-gradient-to-br from-pink-600 to-rose-600',
      icon: Video,
    },
    {
      key: 'story' as const,
      title: 'Story',
      data: videos.story,
      aspectPreview: 'aspect-[9/16]', // 9:16 vertical
      bgColor: 'bg-gradient-to-br from-orange-500 to-amber-500',
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Analysis Summary */}
      <div className="bg-muted/30 rounded-lg p-4 border border-border/40">
        <h4 className="font-medium text-sm mb-2">Motion Analysis</h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            Mood: {analysis.mood}
          </Badge>
          {analysis.actions.slice(0, 3).map((action) => (
            <Badge key={action} variant="secondary" className="text-xs">
              {action}
            </Badge>
          ))}
        </div>
      </div>

      {/* Video Prompts */}
      <div className="grid gap-4 md:grid-cols-3">
        {videoConfigs.map(({ key, title, data, aspectPreview, bgColor, icon: Icon }) => (
          <Card key={key} className="overflow-hidden">
            {/* Visual Preview */}
            <div className={`h-32 ${bgColor} flex items-center justify-center relative overflow-hidden`}>
              <div className="text-center text-white">
                <Icon className="w-10 h-10 mx-auto opacity-60" />
                <div className="flex items-center justify-center gap-1 mt-2">
                  <Clock className="w-3 h-3 opacity-60" />
                  <span className="text-sm font-medium opacity-80">
                    {data.duration}
                  </span>
                </div>
              </div>
              {/* Animated bars to suggest video */}
              <div className="absolute bottom-0 left-0 right-0 h-1 flex gap-0.5 px-2 pb-1">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-white/30 rounded-full"
                    style={{
                      height: `${Math.random() * 50 + 50}%`,
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{title}</h4>
                <Badge variant="outline" className="text-xs">
                  {data.duration}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground line-clamp-4">
                {data.prompt}
              </p>

              {data.cameraMovement && (
                <div className="flex items-center gap-1 text-xs text-primary">
                  <Film className="w-3 h-3" />
                  <span>{data.cameraMovement}</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground/70">
                {data.purpose}
              </p>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleCopy(data.prompt, key)}
                >
                  {copiedId === key ? (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      Copy Prompt
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="brass"
                  className="flex-1"
                  onClick={() => {
                    navigate("/studio", {
                      state: {
                        mode: "video",
                        script: data.prompt,
                        duration: data.duration,
                        cameraMovement: data.cameraMovement || "static"
                      }
                    });
                  }}
                >
                  <Play className="w-3 h-3 mr-1" />
                  Cut Video
                </Button>
              </div>

              {onRegenerate && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => onRegenerate(key)}
                  disabled={isRegenerating}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isRegenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default VideoScriptResults;
