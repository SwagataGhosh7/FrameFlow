import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  Film,
  Grid2x2,
  Loader2,
  Moon,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Sun,
  Table,
  Trash2,
} from 'lucide-react';
import { LightboxModal } from './components/LightboxModal';
import { PanelArtwork } from './components/PanelArtwork';
import { PresentationView } from './components/PresentationView';
import { SAMPLE_SCRIPTS } from './data/sampleScripts';
import type {
  ArtStyle,
  AspectRatio,
  PanelRenderer,
  StoryboardPanel,
  StoryboardProject,
} from './types/storyboard';
import { exportStoryboardPdf } from './utils/pdfExport';

type AppSection = 'workspace' | 'json' | 'characters' | 'library';
type BoardViewMode = 'grid' | 'presentation' | 'sheet';

const ART_STYLES: ArtStyle[] = [
  'Digital Concept Art',
  'Graphic Novel',
  'Charcoal Sketch',
  'Photorealistic Cinema',
  'Noir Ink Wash',
];

const ASPECT_RATIOS: AspectRatio[] = ['16:9', '4:3', '2.39:1'];

export default function App() {
  const initialSample = SAMPLE_SCRIPTS[0];

  const [activeSection, setActiveSection] = useState<AppSection>('workspace');
  const [boardViewMode, setBoardViewMode] = useState<BoardViewMode>('grid');
  const [darkroomMode, setDarkroomMode] = useState(false);
  const [showGuides, setShowGuides] = useState(false);

  const [projectId, setProjectId] = useState<string>(() => `proj-${Date.now()}`);
  const [projectTitle, setProjectTitle] = useState(initialSample.title);
  const [scriptText, setScriptText] = useState(initialSample.scriptText);
  const [artStyle, setArtStyle] = useState<ArtStyle>(initialSample.artStyle);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialSample.aspectRatio);
  const [panelRenderer, setPanelRenderer] = useState<PanelRenderer>('auto');
  const [capabilities, setCapabilities] = useState({
    hasGemini: true,
    hasFluxDocker: false,
    hasHfFlux: false,
  });
  const [panels, setPanels] = useState<StoryboardPanel[]>(initialSample.preloadedPanels ?? []);

  const [isParsing, setIsParsing] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<{ current: number; total: number } | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [lightboxPanelNumber, setLightboxPanelNumber] = useState<number | null>(null);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const [savedProjects, setSavedProjects] = useState<StoryboardProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkroomMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkroomMode]);

  useEffect(() => {
    void fetchSavedProjects();
    void fetch('/api/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCapabilities(data);
      })
      .catch(() => undefined);
  }, []);

  const fetchSavedProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.projects)) {
        setSavedProjects(data.projects);
      }
    } catch {
      // Initial fetch error handled quietly
    } finally {
      setLoadingProjects(false);
    }
  };

  const strictJsonOutput = useMemo(() => {
    return JSON.stringify(
      {
        storyboard: panels.map((p) => ({
          panel_number: p.panel_number,
          scene_heading: p.scene_heading,
          action_summary: p.action_summary,
          characters_in_scene: p.characters_in_scene,
          image_prompt: p.image_prompt,
        })),
      },
      null,
      2,
    );
  }, [panels]);

  const characterBible = useMemo(() => {
    const map = new Map<
      string,
      { name: string; descriptions: string[]; panelNumbers: number[] }
    >();

    for (const panel of panels) {
      for (const entry of panel.characters_in_scene) {
        const colonIdx = entry.indexOf(':');
        const rawName = (colonIdx >= 0 ? entry.slice(0, colonIdx) : entry).trim();
        const desc = (colonIdx >= 0 ? entry.slice(colonIdx + 1) : '').trim();
        if (!rawName) continue;

        const key = rawName.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          if (desc && !existing.descriptions.includes(desc)) {
            existing.descriptions.push(desc);
          }
          if (!existing.panelNumbers.includes(panel.panel_number)) {
            existing.panelNumbers.push(panel.panel_number);
          }
        } else {
          map.set(key, {
            name: rawName,
            descriptions: desc ? [desc] : [],
            panelNumbers: [panel.panel_number],
          });
        }
      }
    }

    return Array.from(map.values());
  }, [panels]);

  const distinctSceneCount = useMemo(() => {
    return new Set(panels.map((p) => p.scene_heading.trim().toUpperCase())).size;
  }, [panels]);

  const lightboxPanel = useMemo(
    () => panels.find((p) => p.panel_number === lightboxPanelNumber) ?? null,
    [panels, lightboxPanelNumber],
  );

  const renderSinglePanel = async (
    panel: StoryboardPanel,
    targetStyle: ArtStyle,
    targetRatio: AspectRatio,
  ) => {
    setPanels((prev) =>
      prev.map((item) =>
        item.panel_number === panel.panel_number
          ? { ...item, renderStatus: 'rendering', renderError: undefined }
          : item,
      ),
    );

    try {
      const res = await fetch('/api/storyboard/render-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panel_number: panel.panel_number,
          scene_heading: panel.scene_heading,
          action_summary: panel.action_summary,
          characters_in_scene: panel.characters_in_scene,
          image_prompt: panel.image_prompt,
          artStyle: targetStyle,
          aspectRatio: targetRatio,
          renderer: panelRenderer,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to render storyboard frame.');
      }

      setPanels((prev) =>
        prev.map((item) =>
          item.panel_number === panel.panel_number
            ? {
                ...item,
                imageUrl: data.imageUrl ?? undefined,
                svgMarkup: data.svgMarkup ?? undefined,
                renderStatus: 'ready',
              }
            : item,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Panel render failed';
      setPanels((prev) =>
        prev.map((item) =>
          item.panel_number === panel.panel_number
            ? { ...item, renderStatus: 'error', renderError: message }
            : item,
        ),
      );
      setErrorBanner(message);
    }
  };

  const handleGenerateStoryboard = async () => {
    if (!scriptText.trim() || isParsing || renderingProgress !== null) return;

    setErrorBanner(null);
    setIsParsing(true);
    setActiveSection('workspace');

    try {
      const parseRes = await fetch('/api/storyboard/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText,
          artStyle,
          aspectRatio,
        }),
      });

      const parseData = await parseRes.json();
      if (!parseRes.ok) {
        throw new Error(parseData.error || 'Unable to parse screenplay.');
      }

      const parsedPanels: StoryboardPanel[] = (parseData.storyboard ?? []).map(
        (p: StoryboardPanel, idx: number) => ({
          panel_number: Number(p.panel_number) || idx + 1,
          scene_heading: String(p.scene_heading || `SCENE ${idx + 1}`),
          action_summary: String(p.action_summary || ''),
          characters_in_scene: Array.isArray(p.characters_in_scene) ? p.characters_in_scene : [],
          image_prompt: String(p.image_prompt || ''),
          renderStatus: 'rendering',
        }),
      );

      setPanels(parsedPanels);
      setIsParsing(false);
      setRenderingProgress({ current: 0, total: parsedPanels.length });

      for (let i = 0; i < parsedPanels.length; i++) {
        setRenderingProgress({ current: i + 1, total: parsedPanels.length });
        await renderSinglePanel(parsedPanels[i], artStyle, aspectRatio);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Storyboard generation failed.';
      setErrorBanner(message);
    } finally {
      setIsParsing(false);
      setRenderingProgress(null);
    }
  };

  const handleRegenerateFromLightbox = async (panelNumber: number, updatedPrompt: string) => {
    const target = panels.find((p) => p.panel_number === panelNumber);
    if (!target) return;

    const updatedPanel: StoryboardPanel = {
      ...target,
      image_prompt: updatedPrompt,
      imageUrl: undefined,
    };

    setPanels((prev) =>
      prev.map((p) => (p.panel_number === panelNumber ? updatedPanel : p)),
    );
    await renderSinglePanel(updatedPanel, artStyle, aspectRatio);
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = SAMPLE_SCRIPTS.find((s) => s.id === templateId);
    if (!template) return;
    setErrorBanner(null);
    setProjectId(`proj-${Date.now()}`);
    setProjectTitle(template.title);
    setScriptText(template.scriptText);
    setArtStyle(template.artStyle);
    setAspectRatio(template.aspectRatio);
    setPanels(template.preloadedPanels ?? []);
  };

  const handleNewBlankScript = () => {
    setErrorBanner(null);
    setProjectId(`proj-${Date.now()}`);
    setProjectTitle('Untitled Scene');
    setScriptText('');
    setPanels([]);
  };

  const handleSaveProject = async () => {
    if (!projectTitle.trim() && panels.length === 0) return;
    setIsSaving(true);
    setErrorBanner(null);
    try {
      const payload: StoryboardProject = {
        id: projectId,
        title: projectTitle.trim() || 'Untitled Storyboard',
        scriptText,
        artStyle,
        aspectRatio,
        panels,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save storyboard.');
      }
      await fetchSavedProjects();
      setSaveFeedback('Saved to library');
      setTimeout(() => setSaveFeedback(null), 2200);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not save storyboard.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSavedProject = (project: StoryboardProject) => {
    setProjectId(project.id);
    setProjectTitle(project.title);
    setScriptText(project.scriptText);
    setArtStyle(project.artStyle);
    setAspectRatio(project.aspectRatio);
    setPanels(project.panels);
    setActiveSection('workspace');
  };

  const handleDeleteSavedProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSavedProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // Ignore quietly
    }
  };

  const handleExportPdf = async () => {
    if (panels.length === 0 || isExportingPdf) return;
    setIsExportingPdf(true);
    setErrorBanner(null);
    try {
      await exportStoryboardPdf({
        title: projectTitle.trim() || 'Untitled Storyboard',
        artStyle,
        aspectRatio,
        panels,
      });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopyPrompt = async (panelNumber: number, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPromptIndex(panelNumber);
      setTimeout(() => setCopiedPromptIndex(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(strictJsonOutput);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([strictJsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectTitle || 'storyboard').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isBusy = isParsing || renderingProgress !== null;

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111318] dark:bg-[#0B0D11] dark:text-[#F1F3F5]">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 single-line links) — Zone 3 (1 primary CTA) */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur-sm dark:border-neutral-800 dark:bg-[#101319]/95">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('workspace');
            }}
            className="font-display text-xl font-bold tracking-tight text-neutral-950 dark:text-white whitespace-nowrap shrink-0"
          >
            Frameflow
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {(
              [
                { id: 'workspace', label: 'Workspace' },
                { id: 'json', label: 'JSON Inspector' },
                { id: 'characters', label: 'Character Bible' },
                { id: 'library', label: 'Saved Boards' },
              ] as const
            ).map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-neutral-950 dark:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-3.5 h-0.5 bg-[#D94E28]" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={panels.length === 0 || isExportingPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-[#D94E28] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C2411E] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {isExportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}</span>
            </button>
          </div>
        </div>

        {/* Mobile section tabs */}
        <div className="flex items-center gap-4 overflow-x-auto border-t border-neutral-100 px-6 py-2 md:hidden dark:border-neutral-800/80">
          {(
            [
              { id: 'workspace', label: 'Workspace' },
              { id: 'json', label: 'JSON' },
              { id: 'characters', label: 'Characters' },
              { id: 'library', label: 'Saved' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                activeSection === item.id
                  ? 'text-[#D94E28]'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {errorBanner && (
        <div className="mx-auto max-w-[1440px] px-6 pt-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-medium underline whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {activeSection === 'workspace' && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Left Script Dock */}
            <aside className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#13161D] lg:col-span-4 lg:sticky lg:top-20">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
                <h1 className="font-display text-lg font-semibold tracking-tight text-neutral-950 dark:text-white">
                  Script Input
                </h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNewBlankScript}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDarkroomMode((d) => !d)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    aria-label={darkroomMode ? 'Switch to studio light mode' : 'Switch to darkroom mode'}
                    title={darkroomMode ? 'Studio Light' : 'Darkroom'}
                  >
                    {darkroomMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="project-title"
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                  >
                    Project Title
                  </label>
                  <input
                    id="project-title"
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="Enter screenplay title"
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-[#F7F8FA] px-3 py-2 text-sm font-medium text-neutral-900 focus:border-[#D94E28] focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-100 dark:focus:bg-[#0B0D11]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Sample Screenplays
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                      {scriptText.trim() ? `${scriptText.trim().split(/\s+/).length} words` : '0 words'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {SAMPLE_SCRIPTS.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => handleLoadTemplate(sample.id)}
                        className="rounded-md border border-neutral-200 bg-[#F7F8FA] px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-300 dark:hover:border-neutral-600 whitespace-nowrap shrink-0"
                      >
                        {sample.title}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="script-textarea"
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                  >
                    Screenplay or Story Text
                  </label>
                  <textarea
                    id="script-textarea"
                    rows={12}
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    placeholder="INT. SUBWAY PLATFORM - NIGHT&#10;&#10;Fluorescent tubes flicker above wet concrete..."
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-[#F7F8FA] p-3 font-mono text-xs leading-relaxed text-neutral-900 focus:border-[#D94E28] focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-100 dark:focus:bg-[#0B0D11]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="art-style-select"
                      className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                    >
                      Visual Style
                    </label>
                    <select
                      id="art-style-select"
                      value={artStyle}
                      onChange={(e) => setArtStyle(e.target.value as ArtStyle)}
                      className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-[#F7F8FA] px-3 py-2 text-xs font-medium text-neutral-900 focus:border-[#D94E28] focus:outline-none dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-100"
                    >
                      {ART_STYLES.map((style) => (
                        <option key={style} value={style}>
                          {style}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="aspect-ratio-select"
                      className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                    >
                      Frame Aspect
                    </label>
                    <select
                      id="aspect-ratio-select"
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                      className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-[#F7F8FA] px-3 py-2 font-mono text-xs font-medium text-neutral-900 focus:border-[#D94E28] focus:outline-none dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-100"
                    >
                      {ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="renderer-select"
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                  >
                    Image Engine
                  </label>
                  <select
                    id="renderer-select"
                    value={panelRenderer}
                    onChange={(e) => setPanelRenderer(e.target.value as PanelRenderer)}
                    className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-[#F7F8FA] px-3 py-2 text-xs font-medium text-neutral-900 focus:border-[#D94E28] focus:outline-none dark:border-neutral-700 dark:bg-[#0B0D11] dark:text-neutral-100"
                  >
                    <option value="auto">
                      Auto ({capabilities.hasFluxDocker ? 'FLUX.1 Docker' : capabilities.hasHfFlux ? 'FLUX.1 Hugging Face' : 'Built-in Vector'})
                    </option>
                    <option value="svg">Built-in Vector (Gemini 4 Hydrogen)</option>
                    <option value="flux-docker">
                      FLUX.1 [schnell] Docker {capabilities.hasFluxDocker ? '(Connected)' : '(Set FLUX_API_URL)'}
                    </option>
                    <option value="flux-hf">
                      FLUX.1 [schnell] Hugging Face {capabilities.hasHfFlux ? '(Connected)' : '(Set HF_TOKEN)'}
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateStoryboard}
                  disabled={!scriptText.trim() || isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#D94E28] dark:hover:bg-[#C2411E]"
                >
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Film className="h-4 w-4" />
                  )}
                  <span>
                    {isParsing
                      ? 'Parsing Scenes & Characters...'
                      : renderingProgress
                        ? `Rendering Panel ${renderingProgress.current} of ${renderingProgress.total}...`
                        : 'Generate Storyboard'}
                  </span>
                </button>
              </div>
            </aside>

            {/* Right Storyboard Lightbox Canvas */}
            <section className="space-y-5 lg:col-span-8">
              {/* Workspace toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-[#13161D]">
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-950 dark:text-white truncate">
                    {projectTitle || 'Untitled Storyboard'}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="tabular-nums">{panels.length} panels</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{distinctSceneCount} scenes</span>
                    <span aria-hidden="true">·</span>
                    <span>{artStyle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{aspectRatio}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1 rounded-lg bg-[#F7F8FA] p-1 dark:bg-[#0B0D11]">
                    <button
                      type="button"
                      onClick={() => setBoardViewMode('grid')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        boardViewMode === 'grid'
                          ? 'bg-white text-neutral-950 shadow-xs dark:bg-[#1C202A] dark:text-white'
                          : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                      }`}
                    >
                      <Grid2x2 className="h-3.5 w-3.5" />
                      <span>Grid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardViewMode('presentation')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        boardViewMode === 'presentation'
                          ? 'bg-white text-neutral-950 shadow-xs dark:bg-[#1C202A] dark:text-white'
                          : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                      }`}
                    >
                      <Presentation className="h-3.5 w-3.5" />
                      <span>Presentation</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardViewMode('sheet')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        boardViewMode === 'sheet'
                          ? 'bg-white text-neutral-950 shadow-xs dark:bg-[#1C202A] dark:text-white'
                          : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                      }`}
                    >
                      <Table className="h-3.5 w-3.5" />
                      <span>Prompt Sheet</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowGuides((g) => !g)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      showGuides
                        ? 'border-[#D94E28] bg-[#D94E28]/10 text-[#D94E28]'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
                    }`}
                  >
                    Framing Guides
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveProject}
                    disabled={isSaving || panels.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-45 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
                  >
                    {saveFeedback ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>{saveFeedback ?? (isSaving ? 'Saving...' : 'Save Board')}</span>
                  </button>
                </div>
              </div>

              {/* Empty state */}
              {panels.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-20 text-center dark:border-neutral-700 dark:bg-[#13161D]">
                  <FileText className="h-8 w-8 text-neutral-400" />
                  <h3 className="mt-4 font-display text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    Ready to visualize your script
                  </h3>
                  <p className="mt-1.5 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
                    Paste raw screenplay or prose on the left, choose a visual style, and generate sequential storyboard panels with consistent character prompts.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('morning-rain')}
                      className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
                    >
                      Load Pre-rendered Example
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('airlock-seven')}
                      className="rounded-lg bg-[#D94E28] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#C2411E] whitespace-nowrap shrink-0"
                    >
                      Load Sci-Fi Script
                    </button>
                  </div>
                </div>
              ) : boardViewMode === 'presentation' ? (
                <PresentationView
                  panels={panels}
                  aspectRatio={aspectRatio}
                  showGuides={showGuides}
                />
              ) : boardViewMode === 'sheet' ? (
                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#13161D]">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-[#F7F8FA] text-neutral-500 dark:border-neutral-800 dark:bg-[#0B0D11] dark:text-neutral-400">
                          <th className="px-4 py-3 font-medium">Panel</th>
                          <th className="px-4 py-3 font-medium">Scene Heading</th>
                          <th className="px-4 py-3 font-medium">Action Summary</th>
                          <th className="px-4 py-3 font-medium">FLUX.1 Image Prompt</th>
                          <th className="px-4 py-3 text-right font-medium">Copy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                        {panels.map((panel) => (
                          <tr
                            key={panel.panel_number}
                            className="hover:bg-neutral-50/70 dark:hover:bg-white/[0.02]"
                          >
                            <td className="px-4 py-3 font-mono font-semibold tabular-nums text-[#D94E28] align-top">
                              {String(panel.panel_number).padStart(2, '0')}
                            </td>
                            <td className="px-4 py-3 font-mono font-medium text-neutral-900 dark:text-neutral-100 align-top whitespace-nowrap">
                              {panel.scene_heading}
                            </td>
                            <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300 align-top min-w-[200px]">
                              {panel.action_summary}
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 align-top min-w-[280px]">
                              {panel.image_prompt}
                            </td>
                            <td className="px-4 py-3 text-right align-top">
                              <button
                                type="button"
                                onClick={() => handleCopyPrompt(panel.panel_number, panel.image_prompt)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                aria-label={`Copy prompt for panel ${panel.panel_number}`}
                              >
                                {copiedPromptIndex === panel.panel_number ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {panels.map((panel) => (
                    <article
                      key={panel.panel_number}
                      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#13161D]"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                        <div className="flex min-w-0 items-center gap-2 text-xs">
                          <span className="font-mono font-semibold tabular-nums text-[#D94E28] shrink-0">
                            Panel {String(panel.panel_number).padStart(2, '0')}
                          </span>
                          <span className="text-neutral-400 shrink-0" aria-hidden="true">
                            ·
                          </span>
                          <h3 className="truncate font-mono font-medium text-neutral-900 dark:text-neutral-100">
                            {panel.scene_heading}
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => renderSinglePanel(panel, artStyle, aspectRatio)}
                          disabled={panel.renderStatus === 'rendering'}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 shrink-0"
                          title="Re-render panel artwork"
                          aria-label={`Re-render panel ${panel.panel_number}`}
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              panel.renderStatus === 'rendering' ? 'animate-spin' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <PanelArtwork
                        panel={panel}
                        aspectRatio={aspectRatio}
                        showGuides={showGuides}
                        onClick={() => setLightboxPanelNumber(panel.panel_number)}
                      />

                      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                        <div className="space-y-2.5">
                          <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                            {panel.action_summary}
                          </p>

                          {panel.characters_in_scene.length > 0 && (
                            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                Cast:{' '}
                              </span>
                              {panel.characters_in_scene.join(' · ')}
                            </p>
                          )}
                        </div>

                        <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                              FLUX.1 Prompt
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setLightboxPanelNumber(panel.panel_number)}
                                className="text-[11px] font-medium text-neutral-600 hover:text-[#D94E28] dark:text-neutral-400 dark:hover:text-[#D94E28]"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyPrompt(panel.panel_number, panel.image_prompt)
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
                              >
                                {copiedPromptIndex === panel.panel_number ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <p className="mt-1.5 line-clamp-2 font-mono text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                            {panel.image_prompt}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeSection === 'json' && (
          <section className="mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#13161D]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
              <div>
                <h1 className="font-display text-lg font-semibold text-neutral-950 dark:text-white">
                  Strict JSON Storyboard Output
                </h1>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Validated schema ready for FLUX.1 image pipelines and external renderers
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
                >
                  {copiedJson ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  disabled={panels.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#111318] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-45 dark:bg-[#D94E28] dark:hover:bg-[#C2411E] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .json</span>
                </button>
              </div>
            </div>
            <pre className="max-h-[70vh] overflow-auto p-6 font-mono text-xs leading-relaxed text-neutral-800 dark:text-neutral-200">
              {strictJsonOutput}
            </pre>
          </section>
        )}

        {activeSection === 'characters' && (
          <section className="mx-auto max-w-5xl space-y-5">
            <div className="rounded-xl border border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-[#13161D]">
              <h1 className="font-display text-lg font-semibold text-neutral-950 dark:text-white">
                Character Continuity Bible
              </h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Physical traits and wardrobe extracted across panels to keep subject descriptions consistent across shots.
              </p>
            </div>

            {characterBible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center dark:border-neutral-700 dark:bg-[#13161D]">
                <BookOpen className="mx-auto h-7 w-7 text-neutral-400" />
                <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
                  No characters extracted yet. Generate a storyboard in the Workspace tab to build the character continuity bible.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {characterBible.map((char) => (
                  <div
                    key={char.name}
                    className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#13161D]"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="font-display text-base font-semibold text-neutral-950 dark:text-white">
                        {char.name}
                      </h2>
                      <span className="font-mono text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        Panels {char.panelNumbers.map((n) => String(n).padStart(2, '0')).join(', ')}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                      {char.descriptions.length > 0 ? (
                        char.descriptions.map((desc, idx) => (
                          <li key={idx}>{desc}</li>
                        ))
                      ) : (
                        <li className="text-neutral-400">No physical notes recorded.</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeSection === 'library' && (
          <section className="mx-auto max-w-5xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-[#13161D]">
              <div>
                <h1 className="font-display text-lg font-semibold text-neutral-950 dark:text-white">
                  Saved Storyboards
                </h1>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Scripts, continuity prompts, and generated frames stored on your studio server.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveProject}
                disabled={isSaving || panels.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[#111318] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-45 dark:bg-[#D94E28] dark:hover:bg-[#C2411E] whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Current Board</span>
              </button>
            </div>

            {loadingProjects ? (
              <div className="flex items-center justify-center py-16 text-sm text-neutral-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Loading saved boards...</span>
              </div>
            ) : savedProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center dark:border-neutral-700 dark:bg-[#13161D]">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No saved boards yet. Click &ldquo;Save Board&rdquo; in the workspace to persist your script and panels.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-[#13161D]">
                {savedProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                  >
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-neutral-950 dark:text-white truncate">
                        {proj.title}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                        <span className="tabular-nums">{proj.panels.length} panels</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.artStyle}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{proj.aspectRatio}</span>
                        <span aria-hidden="true">·</span>
                        <span>Updated {new Date(proj.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenSavedProject(proj)}
                        className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
                      >
                        Open in Workspace
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedProject(proj.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        aria-label={`Delete ${proj.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <LightboxModal
        panel={lightboxPanel}
        aspectRatio={aspectRatio}
        showGuides={showGuides}
        onClose={() => setLightboxPanelNumber(null)}
        onRegeneratePanel={handleRegenerateFromLightbox}
      />
    </div>
  );
}
