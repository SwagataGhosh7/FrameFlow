import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { AspectRatio, StoryboardPanel } from '../types/storyboard';
import { PanelArtwork } from './PanelArtwork';

interface PresentationViewProps {
  panels: StoryboardPanel[];
  aspectRatio: AspectRatio;
  showGuides: boolean;
}

export function PresentationView({ panels, aspectRatio, showGuides }: PresentationViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const safeIndex = Math.min(activeIndex, Math.max(0, panels.length - 1));
  const currentPanel = panels[safeIndex];

  useEffect(() => {
    setActiveIndex(0);
    setIsPlaying(false);
  }, [panels.length]);

  useEffect(() => {
    if (!isPlaying || panels.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % panels.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isPlaying, panels.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') {
        setActiveIndex((prev) => Math.min(panels.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panels.length]);

  if (!currentPanel) return null;

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-[#0D0F14] dark:border-neutral-800">
        <div className="mx-auto max-w-4xl p-4 sm:p-6">
          <PanelArtwork
            panel={currentPanel}
            aspectRatio={aspectRatio}
            showGuides={showGuides}
            className="rounded-lg border border-white/10"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#13161D] px-6 py-4 text-neutral-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="font-mono font-semibold tabular-nums text-[#D94E28]">
                Panel {String(currentPanel.panel_number).padStart(2, '0')} of {String(panels.length).padStart(2, '0')}
              </span>
              <span className="text-neutral-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-neutral-300 truncate">{currentPanel.scene_heading}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-200">
              {currentPanel.action_summary}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
              disabled={safeIndex === 0}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              aria-label="Previous panel"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              disabled={panels.length <= 1}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#D94E28] px-4 text-xs font-medium text-white transition-colors hover:bg-[#C2411E] disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlaying ? 'Pause Animatic' : 'Play Animatic'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveIndex((prev) => Math.min(panels.length - 1, prev + 1))}
              disabled={safeIndex === panels.length - 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              aria-label="Next panel"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filmstrip scrubber */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {panels.map((p, idx) => {
          const isActive = idx === safeIndex;
          return (
            <button
              key={p.panel_number}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`group overflow-hidden rounded-lg border text-left transition-all ${
                isActive
                  ? 'border-[#D94E28] ring-2 ring-[#D94E28]/25'
                  : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'
              }`}
            >
              <PanelArtwork panel={p} aspectRatio={aspectRatio} />
              <div className="bg-white px-2.5 py-1.5 dark:bg-[#13161D]">
                <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                  <span className={isActive ? 'font-semibold text-[#D94E28]' : 'text-neutral-500 dark:text-neutral-400'}>
                    #{String(p.panel_number).padStart(2, '0')}
                  </span>
                  <span className="truncate pl-2 text-neutral-600 dark:text-neutral-400">
                    {p.scene_heading.split('-')[0].trim()}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
