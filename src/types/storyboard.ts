export type ArtStyle =
  | 'Digital Concept Art'
  | 'Graphic Novel'
  | 'Charcoal Sketch'
  | 'Photorealistic Cinema'
  | 'Noir Ink Wash';

export type AspectRatio = '16:9' | '4:3' | '2.39:1';

export type PanelRenderer = 'auto' | 'svg' | 'flux-docker' | 'flux-hf';

export type PanelRenderStatus = 'idle' | 'rendering' | 'ready' | 'error';

export interface StoryboardPanel {
  panel_number: number;
  scene_heading: string;
  action_summary: string;
  characters_in_scene: string[];
  image_prompt: string;
  imageUrl?: string;
  svgMarkup?: string;
  renderStatus?: PanelRenderStatus;
  renderError?: string;
}

export interface StoryboardDocument {
  storyboard: StoryboardPanel[];
}

export interface StoryboardProject {
  id: string;
  title: string;
  scriptText: string;
  artStyle: ArtStyle;
  aspectRatio: AspectRatio;
  panels: StoryboardPanel[];
  createdAt: string;
  updatedAt: string;
}

export interface SampleScriptTemplate {
  id: string;
  title: string;
  genre: string;
  artStyle: ArtStyle;
  aspectRatio: AspectRatio;
  scriptText: string;
  preloadedPanels?: StoryboardPanel[];
}
