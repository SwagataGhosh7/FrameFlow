import { useState } from 'react';
import { Film, Loader2 } from 'lucide-react';
import type { AspectRatio, StoryboardPanel } from '../types/storyboard';

interface PanelArtworkProps {
  panel: StoryboardPanel;
  aspectRatio: AspectRatio;
  showGuides?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PanelArtwork({
  panel,
  aspectRatio,
  showGuides = false,
  onClick,
  className = '',
}: PanelArtworkProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const aspectClass =
    aspectRatio === '4:3'
      ? 'aspect-[4/3]'
      : aspectRatio === '2.39:1'
        ? 'aspect-[21/9]'
        : 'aspect-video';

  const isRendering = panel.renderStatus === 'rendering';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={onClick ? `Inspect panel ${panel.panel_number}: ${panel.scene_heading}` : undefined}
      className={`relative w-full overflow-hidden bg-[#151821] ${aspectClass} ${
        onClick
          ? 'cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94E28]'
          : ''
      } ${className}`}
    >
      {isRendering ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#151821] text-neutral-300">
          <Loader2 className="h-5 w-5 animate-spin text-[#D94E28]" />
          <span className="font-mono text-xs tracking-wide text-neutral-400">
            Rendering panel {String(panel.panel_number).padStart(2, '0')}
          </span>
        </div>
      ) : panel.imageUrl && !imgFailed ? (
        <img
          src={panel.imageUrl}
          alt={`Panel ${panel.panel_number} — ${panel.scene_heading}`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.015]"
        />
      ) : panel.svgMarkup ? (
        <div
          className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:block"
          dangerouslySetInnerHTML={{ __html: panel.svgMarkup }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#1B1F2A] via-[#141720] to-[#0D0F14] px-6 text-center">
          <Film className="h-6 w-6 text-neutral-500" />
          <span className="font-mono text-xs text-neutral-400">{panel.scene_heading}</span>
        </div>
      )}

      {showGuides && !isRendering && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/15" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/15" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/15" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/15" />
          <div className="absolute inset-3 border border-white/15" />
        </div>
      )}
    </div>
  );
}
