const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function run() {
    try {
        const apiKey = process.env.GEMINI_API_KEY || 'dummy';
        const ai = new GoogleGenAI({ apiKey: apiKey });

        if (apiKey === 'dummy') {
            console.log("No key");
            return;
        }

        const prompt = "What is this document about?";
        const fileBase64 = Buffer.from("%PDF-1.4...").toString('base64');
        const mimeType = "application/pdf";

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: fileBase64,
                        mimeType: mimeType
                    }
                }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });
        console.log(response.text);
    } catch (error) {
        console.error("Error Details:", error);
    }
}
run();
