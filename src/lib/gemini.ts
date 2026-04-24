import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function extractEventsFromImage(base64Image: string, mimeType: string) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Identify and extract all distinct events from this image. 
  For each event, look for:
  - Title of the event
  - Date (format as YYYY-MM-DD if possible)
  - Start Time
  - End Time
  - Location
  - Description/Notes
  
  Return the data as an array of event objects in a clean JSON format.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "Generate a unique temp ID" },
                title: { type: Type.STRING },
                date: { type: Type.STRING, description: "YYYY-MM-DD" },
                startTime: { type: Type.STRING, description: "HH:mm" },
                endTime: { type: Type.STRING, description: "HH:mm" },
                location: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["title", "date", "startTime"]
            }
          }
        },
        required: ["events"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Failed to extract data from image");
  }

  const parsed = JSON.parse(response.text);
  return parsed.events;
}
