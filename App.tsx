import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EditMode, ImageState, ProcessingState, FilterType, Adjustments, CropSettings } from './types';
import { performImageEdit } from './services/geminiService';
import { 
  UploadIcon, MagicWandIcon, TrashIcon, DownloadIcon, SparklesIcon, 
  UndoIcon, RedoIcon, SlidersIcon, FilterIcon, CropIcon, ShareIcon, AddImageIcon 
} from './components/Icons';

// --- Default States ---
const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };

const BACKGROUND_OPTIONS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Sunset Gradient', value: 'linear-gradient(to top, #fca5a5, #fcd34d)' },
  { name: 'Midnight Gradient', value: 'linear-gradient(to top, #1e3a8a, #000000)' },
];

const ASPECT_RATIOS = [
  { name: 'Free', value: null },
  { name: 'Square (1:1)', value: 1 },
  { name: 'Portrait (9:16)', value: 9/16 },
  { name: 'Landscape (16:9)', value: 16/9 },
  { name: '4:3', value: 4/3 },
];

// --- Sub-components ---

const Spinner = () => (
  <div className="flex items-center justify-center space-x-2 animate-pulse">
    <div className="w-4 h-4 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
    <div className="w-4 h-4 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
    <div className="w-4 h-4 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
  </div>
);

const ToolButton = ({ 
  icon, 
  label, 
  isActive, 
  onClick 
}: { 
  icon: React.ReactNode; 
  label: string; 
  isActive: boolean; 
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 w-full
      ${isActive 
        ? 'bg-primary-600/20 text-primary-400 ring-1 ring-primary-500/50' 
        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
  >
    <div className="mb-1">{icon}</div>
    <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
  </button>
);

const SliderControl = ({ label, value, min, max, onChange }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void }) => (
  <div className="mb-4">
    <div className="flex justify-between mb-1">
      <label className="text-xs text-gray-400 font-medium">{label}</label>
      <span className="text-xs text-primary-400">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
    />
  </div>
);

const App = () => {
  // Batch processing: Array of ImageStates
  const [images, setImages] = useState<ImageState[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  // Global processing state
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    error: null,
    mode: null,
  });

  // UI State
  const [activeToolTab, setActiveToolTab] = useState<'magic' | 'adjust' | 'filters' | 'crop'>('magic');
  const [selectedBgColor, setSelectedBgColor] = useState<string>(BACKGROUND_OPTIONS[0].value);
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  
  // Crop UI State
  const [cropConfig, setCropConfig] = useState<CropSettings>({ aspectRatio: null, active: false });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Helpers to get active image
  const activeImage = images.find(img => img.id === activeImageId);
  
  // -- Initialization --
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const newImages: ImageState[] = [];
      Array.from(files).forEach((file: File) => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              const base64 = e.target.result as string;
              const newImg: ImageState = {
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                original: base64,
                current: base64, // Initially, current is original
                thumbnail: base64, // Simplification
                mimeType: file.type,
                adjustments: { ...DEFAULT_ADJUSTMENTS },
                filter: FilterType.NONE,
                history: [{
                  current: base64,
                  adjustments: { ...DEFAULT_ADJUSTMENTS },
                  filter: FilterType.NONE
                }],
                historyIndex: 0
              };
              setImages(prev => {
                const updated = [...prev, newImg];
                if (!activeImageId) setActiveImageId(updated[0].id);
                return updated;
              });
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  // -- History Management --
  const pushHistory = (newState: Partial<ImageState>, imageId: string) => {
    setImages(prev => prev.map(img => {
      if (img.id === imageId) {
        const newHistoryItem = {
          current: newState.current ?? img.current,
          adjustments: { ...(newState.adjustments ?? img.adjustments) },
          filter: newState.filter ?? img.filter
        };
        const newHistory = img.history.slice(0, img.historyIndex + 1);
        newHistory.push(newHistoryItem);
        return {
          ...img,
          ...newState,
          history: newHistory,
          historyIndex: newHistory.length - 1
        };
      }
      return img;
    }));
  };

  const undo = () => {
    if (!activeImage || activeImage.historyIndex <= 0) return;
    const prevIndex = activeImage.historyIndex - 1;
    const historicalState = activeImage.history[prevIndex];
    setImages(prev => prev.map(img => img.id === activeImage.id ? {
      ...img,
      current: historicalState.current,
      adjustments: historicalState.adjustments,
      filter: historicalState.filter,
      historyIndex: prevIndex
    } : img));
  };

  const redo = () => {
    if (!activeImage || activeImage.historyIndex >= activeImage.history.length - 1) return;
    const nextIndex = activeImage.historyIndex + 1;
    const historicalState = activeImage.history[nextIndex];
    setImages(prev => prev.map(img => img.id === activeImage.id ? {
      ...img,
      current: historicalState.current,
      adjustments: historicalState.adjustments,
      filter: historicalState.filter,
      historyIndex: nextIndex
    } : img));
  };

  // -- Editing Functions --

  // 1. Client-Side Adjustments (Non-destructive)
  const updateAdjustment = (key: keyof Adjustments, value: number) => {
    if (!activeImage) return;
    // We don't push history on every drag, typically we'd debounce or push on mouseUp
    // For simplicity, we assume 'live' update, and history push logic would be on 'onChangeEnd' ideally.
    // Here we just update state directly for responsiveness.
    setImages(prev => prev.map(img => img.id === activeImage.id ? {
      ...img,
      adjustments: { ...img.adjustments, [key]: value }
    } : img));
  };
  
  // Commit adjustment to history (e.g. when tab changes or specific save)
  // Simplified: We'll push history when a user selects a filter or completes an AI op.

  const setFilter = (filter: FilterType) => {
    if (!activeImage) return;
    pushHistory({ filter }, activeImage.id);
  };

  // 2. AI Processing
  const handleAIEdit = async (mode: EditMode) => {
    if (!activeImage || processing.isProcessing) return;

    setProcessing({ isProcessing: true, error: null, mode });

    try {
      // We always process the 'original' or 'current' AI base?
      // Usually AI builds on AI. So we use activeImage.current.
      // However, for background replace, we might need the object.
      // Let's use activeImage.current as source.
      
      const resultBase64 = await performImageEdit(
        activeImage.current!,
        activeImage.mimeType,
        mode,
        { 
          backgroundColor: selectedBgColor,
          backgroundImage: customBgImage
        }
      );

      pushHistory({ current: resultBase64 }, activeImage.id);
      setProcessing({ isProcessing: false, error: null, mode: null });
      setCustomBgImage(null); // Reset after use
    } catch (err: any) {
      setProcessing({ 
        isProcessing: false, 
        error: err.message || 'Processing failed.', 
        mode: null 
      });
    }
  };

  // 3. Custom Background Upload
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setCustomBgImage(ev.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // -- Output Generation (Download/Share) --
  // This renders the current state (Image + CSS Filters + Adjustments) to a canvas
  const generateFinalImage = async (): Promise<string | null> => {
    if (!activeImage || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Initial setup
        let sWidth = img.width;
        let sHeight = img.height;
        let sx = 0;
        let sy = 0;

        // Calculate Crop (Center Crop Logic)
        if (cropConfig.aspectRatio) {
           const imgRatio = img.width / img.height;
           const targetRatio = cropConfig.aspectRatio;
           
           if (targetRatio > imgRatio) {
               // Target is wider than image -> Crop Height (Top/Bottom)
               sHeight = img.width / targetRatio;
               sy = (img.height - sHeight) / 2;
           } else {
               // Target is taller/equal -> Crop Width (Left/Right)
               sWidth = img.height * targetRatio;
               sx = (img.width - sWidth) / 2;
           }
        }

        // Set canvas to the cropped size (or original if no crop)
        canvas.width = sWidth;
        canvas.height = sHeight;

        // Apply filters via ctx.filter string
        const adj = activeImage.adjustments;
        const filters = [
          `brightness(${adj.brightness}%)`,
          `contrast(${adj.contrast}%)`,
          `saturate(${adj.saturation}%)`,
          `blur(${adj.blur}px)`
        ];
        
        if (activeImage.filter === FilterType.GRAYSCALE) filters.push('grayscale(100%)');
        if (activeImage.filter === FilterType.SEPIA) filters.push('sepia(100%)');
        if (activeImage.filter === FilterType.VINTAGE) filters.push('sepia(50%) contrast(120%) brightness(90%)');
        
        ctx.filter = filters.join(' ');
        
        // Draw the cropped portion onto the full canvas area (0,0,width,height)
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL(activeImage.mimeType));
      };
      img.src = activeImage.current!;
    });
  };

  const handleDownload = async () => {
    const finalUrl = await generateFinalImage();
    if (finalUrl) {
      const link = document.createElement('a');
      link.href = finalUrl;
      link.download = `gemini-edit-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleShare = async () => {
    const finalUrl = await generateFinalImage();
    if (finalUrl && navigator.share) {
      // Convert DataURL to Blob for sharing
      const res = await fetch(finalUrl);
      const blob = await res.blob();
      const file = new File([blob], 'edited-image.png', { type: 'image/png' });
      
      try {
        await navigator.share({
          title: 'Edited with Gemini Lens',
          files: [file]
        });
      } catch (e) {
        console.log('Share cancelled');
      }
    }
  };

  // -- Render Helper: CSS Filter String --
  const getCssFilterString = (adj: Adjustments, type: FilterType) => {
    let s = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${adj.blur}px) `;
    if (type === FilterType.GRAYSCALE) s += 'grayscale(100%)';
    if (type === FilterType.SEPIA) s += 'sepia(100%)';
    if (type === FilterType.VINTAGE) s += 'sepia(50%) contrast(120%) brightness(90%)';
    return s;
  };

  // --- Main Render ---

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden font-sans selection:bg-primary-500/30">
      
      {/* Hidden Canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar */}
      <header className="h-14 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4 z-20 shadow-md">
        <div className="flex items-center space-x-2">
          <div className="text-primary-500"><SparklesIcon /></div>
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Gemini Lens</span>
        </div>

        <div className="flex items-center space-x-2">
          {activeImage && (
            <>
              <button onClick={undo} disabled={activeImage.historyIndex === 0 || processing.isProcessing} className="p-2 text-gray-400 hover:text-white disabled:opacity-30"><UndoIcon /></button>
              <button onClick={redo} disabled={activeImage.historyIndex === activeImage.history.length - 1 || processing.isProcessing} className="p-2 text-gray-400 hover:text-white disabled:opacity-30"><RedoIcon /></button>
              <div className="w-px h-6 bg-gray-700 mx-2"></div>
              <button onClick={handleShare} className="p-2 text-gray-400 hover:text-primary-400"><ShareIcon /></button>
              <button 
                onClick={handleDownload}
                className="flex items-center space-x-2 px-4 py-1.5 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition-colors"
              >
                <DownloadIcon />
                <span className="hidden sm:inline">Save</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Toolbar */}
        <aside className="w-20 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 space-y-4 z-10">
          <ToolButton 
            icon={<MagicWandIcon />} 
            label="AI Magic" 
            isActive={activeToolTab === 'magic'} 
            onClick={() => setActiveToolTab('magic')} 
          />
          <ToolButton 
            icon={<SlidersIcon />} 
            label="Adjust" 
            isActive={activeToolTab === 'adjust'} 
            onClick={() => setActiveToolTab('adjust')} 
          />
          <ToolButton 
            icon={<FilterIcon />} 
            label="Filters" 
            isActive={activeToolTab === 'filters'} 
            onClick={() => setActiveToolTab('filters')} 
          />
          <ToolButton 
            icon={<CropIcon />} 
            label="Resize" 
            isActive={activeToolTab === 'crop'} 
            onClick={() => setActiveToolTab('crop')} 
          />
        </aside>

        {/* Tools Panel (Sub-sidebar) */}
        {activeImage && (
          <aside className="w-72 bg-gray-900/50 backdrop-blur border-r border-gray-800 p-6 overflow-y-auto animate-fade-in-left">
            
            {activeToolTab === 'magic' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">AI Generation</h3>
                  <div className="space-y-2">
                    <button 
                      onClick={() => handleAIEdit(EditMode.ENHANCE)}
                      disabled={processing.isProcessing}
                      className="w-full text-left px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-750 flex items-center space-x-3 transition-colors border border-gray-700"
                    >
                      <SparklesIcon />
                      <div>
                        <div className="font-semibold text-sm">Auto Enhance</div>
                        <div className="text-xs text-gray-500">4K Upscale & Fix</div>
                      </div>
                    </button>
                    <button 
                       onClick={() => handleAIEdit(EditMode.PIXEL_ART)}
                       disabled={processing.isProcessing}
                       className="w-full text-left px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-750 border border-gray-700 text-sm font-medium"
                    >
                      Pixel Art Style
                    </button>
                    <button 
                       onClick={() => handleAIEdit(EditMode.ANIME)}
                       disabled={processing.isProcessing}
                       className="w-full text-left px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-750 border border-gray-700 text-sm font-medium"
                    >
                      Anime Style
                    </button>
                  </div>
                </div>

                <div>
                   <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Background</h3>
                   <button 
                       onClick={() => handleAIEdit(EditMode.REMOVE_BG)}
                       disabled={processing.isProcessing}
                       className="w-full mb-3 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 text-sm font-medium text-left"
                    >
                      Remove Background
                    </button>
                    
                    <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                      <div className="text-xs font-semibold mb-2">Replace Background</div>
                      <div className="grid grid-cols-5 gap-2 mb-3">
                        {BACKGROUND_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => { setSelectedBgColor(opt.value); setCustomBgImage(null); }}
                            className={`w-8 h-8 rounded-full border-2 ${selectedBgColor === opt.value && !customBgImage ? 'border-white ring-2 ring-primary-500' : 'border-transparent'}`}
                            style={{ background: opt.value }}
                            title={opt.name}
                          />
                        ))}
                      </div>
                      <div className="mb-3">
                        <label className="block w-full text-center px-3 py-2 border border-dashed border-gray-600 rounded-lg text-xs text-gray-400 hover:bg-gray-700 cursor-pointer">
                          {customBgImage ? 'Image Selected' : 'Upload Custom BG'}
                          <input type="file" ref={bgFileInputRef} onChange={handleBgUpload} className="hidden" accept="image/*" />
                        </label>
                      </div>
                      <button 
                        onClick={() => handleAIEdit(EditMode.REPLACE_BG)}
                        disabled={processing.isProcessing}
                        className="w-full py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-bold uppercase tracking-wide"
                      >
                        Apply Replace
                      </button>
                    </div>
                </div>
              </div>
            )}

            {activeToolTab === 'adjust' && (
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Light & Color</h3>
                <SliderControl label="Brightness" value={activeImage.adjustments.brightness} min={0} max={200} onChange={(v) => updateAdjustment('brightness', v)} />
                <SliderControl label="Contrast" value={activeImage.adjustments.contrast} min={0} max={200} onChange={(v) => updateAdjustment('contrast', v)} />
                <SliderControl label="Saturation" value={activeImage.adjustments.saturation} min={0} max={200} onChange={(v) => updateAdjustment('saturation', v)} />
                <SliderControl label="Blur" value={activeImage.adjustments.blur} min={0} max={10} onChange={(v) => updateAdjustment('blur', v)} />
              </div>
            )}

            {activeToolTab === 'filters' && (
               <div className="grid grid-cols-2 gap-3">
                 {Object.values(FilterType).map(f => (
                   <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`p-4 rounded-xl border-2 text-sm font-medium transition-all
                      ${activeImage.filter === f ? 'border-primary-500 bg-primary-500/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-750'}
                    `}
                   >
                     {f}
                   </button>
                 ))}
               </div>
            )}

            {activeToolTab === 'crop' && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Aspect Ratio</h3>
                <div className="space-y-2">
                  {ASPECT_RATIOS.map(ratio => (
                    <button
                      key={ratio.name}
                      onClick={() => setCropConfig({ ...cropConfig, aspectRatio: ratio.value })}
                      className={`w-full text-left px-4 py-3 rounded-lg border 
                        ${cropConfig.aspectRatio === ratio.value ? 'bg-primary-600/20 border-primary-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}
                      `}
                    >
                      {ratio.name}
                    </button>
                  ))}
                  <p className="text-xs text-gray-500 mt-4 text-primary-400">
                    {cropConfig.aspectRatio ? 'Crop active. Previewing Center Crop.' : 'Original Aspect Ratio'}
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Center Canvas Area */}
        <main className="flex-1 bg-gray-950 relative flex flex-col">
          
          {/* Viewport */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-8">
            
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-20" style={{ 
                backgroundImage: 'radial-gradient(#374151 1px, transparent 1px)', 
                backgroundSize: '20px 20px' 
            }}></div>

            {activeImage ? (
              <div className="relative shadow-2xl shadow-black/50 max-h-full max-w-full flex items-center justify-center">
                {processing.isProcessing && (
                  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg">
                    <Spinner />
                    <p className="mt-4 text-white font-medium animate-pulse">Processing...</p>
                  </div>
                )}
                
                {/* Image Container with Crop Preview */}
                <div 
                  className="relative overflow-hidden transition-all duration-300 ease-in-out border-2 border-transparent"
                  style={{
                    // If crop is active, enforce the aspect ratio on the container
                    aspectRatio: cropConfig.aspectRatio ? `${cropConfig.aspectRatio}` : 'auto',
                    // Logic to ensure it fits within the viewport while maintaining aspect ratio
                    maxHeight: 'calc(100vh - 12rem)',
                    maxWidth: '100%',
                    borderColor: cropConfig.aspectRatio ? '#3b82f6' : 'transparent',
                    boxShadow: cropConfig.aspectRatio ? '0 0 0 1000px rgba(0,0,0,0.5)' : 'none' // Focus effect
                  }}
                >
                  <img 
                    src={activeImage.current!} 
                    alt="Work in progress"
                    className="w-full h-full object-cover" 
                    style={{
                      filter: getCssFilterString(activeImage.adjustments, activeImage.filter),
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="mx-auto w-64 h-48 border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center text-gray-500 hover:text-primary-400 hover:border-primary-500 transition-all cursor-pointer bg-gray-900/50"
                >
                  <AddImageIcon />
                  <span className="mt-2 text-sm font-medium">Click to Upload</span>
                  <span className="text-xs mt-1 opacity-50">JPG, PNG, WEBP</span>
                </div>
                <input 
                  type="file" 
                  multiple 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload} 
                  accept="image/*"
                />
              </div>
            )}
          </div>

          {/* Bottom Filmstrip (Batch) */}
          {images.length > 0 && (
            <div className="h-24 bg-gray-900 border-t border-gray-800 flex items-center px-4 space-x-4 overflow-x-auto">
               <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 flex-shrink-0 rounded-lg border border-dashed border-gray-600 flex items-center justify-center text-gray-500 hover:text-white cursor-pointer"
               >
                 <AddImageIcon />
               </div>
               {images.map(img => (
                 <div 
                  key={img.id}
                  onClick={() => setActiveImageId(img.id)}
                  className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${activeImageId === img.id ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
                 >
                   <img src={img.current!} className="w-full h-full object-cover" alt="thumb" />
                 </div>
               ))}
            </div>
          )}

        </main>
      </div>
      
      {/* Error Toast */}
      {processing.error && (
        <div className="fixed bottom-28 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center animate-fade-in-up z-50">
          <span className="mr-2">⚠️</span> {processing.error}
        </div>
      )}

    </div>
  );
};

export default App;