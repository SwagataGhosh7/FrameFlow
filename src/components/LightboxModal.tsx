import { useEffect, useState } from 'react';
import { Check, Copy, ImageDown, Loader2, RefreshCw, X } from 'lucide-react';
import type { AspectRatio, StoryboardPanel } from '../types/storyboard';
import { exportPanelAsPng } from '../utils/pngExport';
import { PanelArtwork } from './PanelArtwork';

interface LightboxModalProps {
  panel: StoryboardPanel | null;
  projectTitle: string;
  aspectRatio: AspectRatio;
  showGuides: boolean;
  onClose: () => void;
  onRegeneratePanel: (panelNumber: number, updatedPrompt: string) => Promise<void>;
}

export function LightboxModal({
  panel,
  projectTitle,
  aspectRatio,
  showGuides,
  onClose,
  onRegeneratePanel,
}: LightboxModalProps) {
  const [editedPrompt, setEditedPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);

  useEffect(() => {
    if (panel) {
      setEditedPrompt(panel.image_prompt);
    }
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panel, onClose]);

  if (!panel) return null;

  const isRendering = panel.renderStatus === 'rendering';

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(editedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Panel ${panel.panel_number} detail`}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-[#13161D]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono font-semibold tabular-nums text-[#D94E28]">
              Panel {String(panel.panel_number).padStart(2, '0')}
            </span>
            <span className="text-neutral-400" aria-hidden="true">
              ·
            </span>
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {panel.scene_heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Close panel view"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="bg-[#0E1016] p-4 sm:p-6 lg:col-span-7 flex items-center justify-center">
            <PanelArtwork
              panel={panel}
              aspectRatio={aspectRatio}
              showGuides={showGuides}
              className="rounded-lg border border-white/10"
            />
          </div>

          <div className="flex flex-col justify-between gap-5 p-6 lg:col-span-5">
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Action Summary
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                  {panel.action_summary}
                </p>
              </div>

              {panel.characters_in_scene.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Characters in Frame
                  </h3>
                  <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {panel.characters_in_scene.map((charDesc, idx) => (
                      <li key={idx} className="border-b border-neutral-100 pb-1.5 last:border-none dark:border-neutral-800/80">
                        {charDesc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="lightbox-prompt-input"
                    className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
                  >
                    FLUX.1 Image Prompt
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy prompt'}</span>
                  </button>
                </div>
                <textarea
                  id="lightbox-prompt-input"
                  rows={5}
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-neutral-200 bg-[#F7F8FA] p-3 font-mono text-xs leading-relaxed text-neutral-800 focus:border-[#D94E28] focus:outline-none dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-200"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button
                type="button"
                disabled={isRendering || isExportingPng || (!panel.imageUrl && !panel.svgMarkup)}
                onClick={async () => {
                  setIsExportingPng(true);
                  try {
                    await exportPanelAsPng({ panel, aspectRatio, projectTitle });
                  } finally {
                    setIsExportingPng(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-45 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
              >
                {isExportingPng ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageDown className="h-4 w-4" />
                )}
                <span>{isExportingPng ? 'Exporting...' : 'Download PNG'}</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={isRendering || !editedPrompt.trim()}
                  onClick={() => onRegeneratePanel(panel.panel_number, editedPrompt)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#D94E28] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C2411E] disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${isRendering ? 'animate-spin' : ''}`} />
                  <span>{isRendering ? 'Rendering...' : 'Regenerate Panel'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
