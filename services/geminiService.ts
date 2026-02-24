import { GoogleGenAI, Type } from "@google/genai";

export const generatePythonScript = async (categories: any[], prompts: any[]) => {
  // Fix: Create a new GoogleGenAI instance right before making an API call 
  // to ensure it always uses the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Act as a world-class Python and macOS Developer. 
    Generate a professional-grade, standalone macOS desktop application using PyQt6 and Pillow.
    
    The app MUST look like a native macOS Sonoma/Ventura app with:
    - A modern QSS (Qt Style Sheet) that implements:
        - Dark background (#1e1e1e)
        - Rounded corners (12px)
        - SF Pro style typography (use 'Sans Serif' fallback)
        - Subtle pink highlights for folders containing sub-folders.
        - Hover states and smooth transitions.
    
    Technical Requirements:
    - Sidebar: Nested folders support. 
    - Prompts List: Modern card-based UI.
    - Image Handling: Resize images to max 400px width using Pillow. Store images as base64 in the SQLite database to keep it a single file portability.
    - Database: Use SQLite (prompts.db). Create it on startup if not exists.
    - Trash: Fully functional trash and restore system.
    - Native Menu: Use the macOS global menu bar for 'About', 'Preferences', and 'Quit'.
    
    INITIAL DATA:
    Please initialize the SQLite database with the following data:
    CATEGORIES: ${JSON.stringify(categories)}
    PROMPTS: ${JSON.stringify(prompts)}
    
    OUTPUT:
    Return ONLY the complete Python source code.
    Include a header comment with exactly these steps:
    1. pip install PyQt6 Pillow
    2. python3 prompt_manager.py
    3. (Optional) pip install py2app && python3 setup.py py2app
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error generating Python script:", error);
    throw error;
  }
};