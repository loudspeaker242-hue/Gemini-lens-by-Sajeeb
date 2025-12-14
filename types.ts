export enum EditMode {
  PIXEL_ART = 'Pixel Art',
  ANIME = 'Anime Style',
  REMOVE_BG = 'Remove Background',
  REPLACE_BG = 'Replace Background',
  ENHANCE = 'AI Enhance',
  NONE = 'None'
}

export enum FilterType {
  NONE = 'Normal',
  GRAYSCALE = 'Grayscale',
  SEPIA = 'Sepia',
  VINTAGE = 'Vintage',
  BLUR = 'Blur'
}

export interface Adjustments {
  brightness: number; // 0-200, default 100
  contrast: number;   // 0-200, default 100
  saturation: number; // 0-200, default 100
  blur: number;       // 0-10, default 0
}

export interface CropSettings {
  aspectRatio: number | null; // null for free, or 1, 1.77, etc.
  active: boolean;
}

export interface ProcessingState {
  isProcessing: boolean;
  error: string | null;
  mode: EditMode | null;
}

export interface ImageState {
  id: string;
  original: string | null; // The base loaded image
  current: string | null;  // The result of AI operations
  thumbnail: string | null;
  mimeType: string;
  name: string;
  
  // Client-side edits (non-destructive)
  adjustments: Adjustments;
  filter: FilterType;
  history: {
    current: string | null; // Snapshot of 'current' (AI result)
    adjustments: Adjustments;
    filter: FilterType;
  }[];
  historyIndex: number;
}

// Augment window for AI Studio specific API
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}