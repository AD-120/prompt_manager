
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generatePythonScript = async (categories: string[], samplePrompts: any[]) => {
  const prompt = `
    Act as an expert Python Developer. 
    Generate a complete, standalone macOS desktop application using PyQt6 and Pillow.
    
    The app is a "Prompt Manager" with:
    - Sidebar categories: ${categories.join(', ')}.
    - A searchable list of prompts.
    - Fields: Title, Multi-line Text (Plain Text), Copy to Clipboard button.
    - Image handling: Drag & drop or file selection, automatic resize to max 400px width using Pillow.
    - Persistence: SQLite database (prompts.db).
    - Modern macOS dark mode aesthetic.
    
    Sample prompt data for context: ${JSON.stringify(samplePrompts.slice(0, 2))}
    
    Include specific instructions for installation: pip install PyQt6 Pillow
    The response must contain ONLY the code and installation instructions in a markdown code block.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 2000 }
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error generating Python script:", error);
    throw error;
  }
};
