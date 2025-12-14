import { GoogleGenAI } from "@google/genai";
import { EditMode } from "../types";

// Helper to strip data URL prefix
const stripBase64Prefix = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

interface EditOptions {
  backgroundColor?: string;
  backgroundImage?: string | null; // Data URL for custom background
}

export const performImageEdit = async (
  imageBase64: string,
  mimeType: string,
  mode: EditMode,
  options: EditOptions = {}
): Promise<string> => {
  
  // 1. Handle API Key Selection
  // 'Enhance' and complex editing often work best with the Pro model
  if (mode === EditMode.ENHANCE || mode === EditMode.REPLACE_BG) {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }
  }

  // 2. Initialize Client
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // 3. Configure Prompt and Model based on Mode
  // Using gemini-2.5-flash-image for speed/cost, upgrade to pro if needed for complex Logic
  let model = 'gemini-2.5-flash-image'; 
  let prompt = '';
  let imageConfig: any = {};
  
  // Prepare contents array (might contain multiple images)
  const contentsParts: any[] = [
    {
      inlineData: {
        mimeType: mimeType,
        data: stripBase64Prefix(imageBase64)
      }
    }
  ];

  switch (mode) {
    case EditMode.PIXEL_ART:
      prompt = 'Convert this image into a pixel art style. Maintain the original subject and composition but render it with clear pixelation and vibrant colors appropriate for pixel art video games.';
      break;
    case EditMode.ANIME:
      prompt = 'Transform this image into a high-quality anime style illustration. Use distinct line work, shading, and anime aesthetic while keeping the subject recognizable.';
      break;
    case EditMode.REMOVE_BG:
      // Requesting pure white is standard for flat BG removal if transparency isn't supported directly by format output easily in prompt mode
      prompt = 'Isolate the main subject of this image and place it on a pure solid white background. Ensure the edges are clean and precise.';
      break;
    case EditMode.REPLACE_BG:
      // Handle Custom Background Image
      if (options.backgroundImage) {
        // Add the background image to the request
        contentsParts.push({
          inlineData: {
            mimeType: options.backgroundImage.split(';')[0].split(':')[1],
            data: stripBase64Prefix(options.backgroundImage)
          }
        });
        prompt = 'Composite the subject from the first image onto the background provided in the second image. Adjust lighting and shadows of the subject to match the new environment realistically.';
        // Use Pro model for better compositing logic
        model = 'gemini-3-pro-image-preview'; 
      } 
      // Handle Color/Gradient
      else if (options.backgroundColor) {
        prompt = `Isolate the main subject of this image and place it on a background with the color/style: ${options.backgroundColor}. Ensure realistic integration.`;
      } 
      else {
        prompt = 'Place the subject of this image into a scenic outdoor environment.';
      }
      break;
    case EditMode.ENHANCE:
      model = 'gemini-3-pro-image-preview';
      prompt = 'Recreate this image in ultra-high resolution (4K). Enhance fine details, textures, and lighting clarity significantly. Fix any blurriness or noise. Make it look like a professional photograph.';
      imageConfig = {
        imageSize: '4K',
        aspectRatio: '1:1', // Or match input if we could detect it, 1:1 safe default
      };
      break;
  }

  // Append prompt to parts
  contentsParts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: contentsParts
      },
      config: {
        imageConfig: Object.keys(imageConfig).length > 0 ? imageConfig : undefined
      }
    });

    // 4. Extract Image from Response
    let outputImageBase64 = '';

    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          outputImageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!outputImageBase64) {
      throw new Error("No image data found in response. The model may have returned text only.");
    }

    return `data:image/png;base64,${outputImageBase64}`;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to process image");
  }
};