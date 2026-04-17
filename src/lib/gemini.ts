import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  isHomogeneous: boolean;
  isModern: boolean;
  isStylish: boolean;
  feedback: string;
  advice: string;
  suggestedOutfit: string;
}

export async function analyzeOutfit(imageData: string, weather: string): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview"; 
  
  const prompt = `
    Analyze this user's outfit in the context of the current weather: ${weather}.
    The user wants an interactive mirror experience.
    Provide the feedback and advice strictly in ARABIC.
    
    Structure your response as a JSON object with the following keys:
    - isHomogeneous: boolean (if the colors and style match well)
    - isModern: boolean (if the outfit looks contemporary)
    - isStylish: boolean (if the overall look is attractive)
    - feedback: string (A compliment in Arabic if it is good, or a polite remark if not. Be encouraging.)
    - advice: string (Specific advice on colors, patterns, or styles in Arabic to improve or compliment the look.)
    - suggestedOutfit: string (A suggestion for an appropriate outfit considering the weather: ${weather} in Arabic.)
    
    Make the tone supportive, motivating, and "mirror-like".
  `;

  try {
    const result = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageData.split(",")[1],
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.text;
    if (!responseText) throw new Error("No response from Gemini");
    return JSON.parse(responseText.trim());
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return {
      isHomogeneous: true,
      isModern: true,
      isStylish: true,
      feedback: "عذراً، لم أستطع تحليل الملابس الآن. لكنك تطل/تطلين بشكل رائع!",
      advice: "حاول مرة أخرى في ضوء أفضل.",
      suggestedOutfit: "ارتدِ ما يجعلك تشعر بالراحة والثقة."
    };
  }
}

export async function getMotivationalQuote(): Promise<string> {
  const model = "gemini-3-flash-preview";
  const prompt = "Give me a very short, powerful motivational or relaxation quote in Arabic for someone looking at themselves in a mirror. Just the quote, no extra text.";
  
  try {
    const result = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return result.text.trim();
  } catch (error) {
    return "أنت رائع كما أنت.";
  }
}

export async function generateSpeech(text: string): Promise<string | undefined> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say in a natural, supportive, and elegant Arabic accent: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("Gemini TTS error:", error);
    return undefined;
  }
}
