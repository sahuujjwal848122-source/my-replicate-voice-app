import fetch from 'node-fetch';

export default async function handler(req, res) {
    // सिर्फ POST रिक्वेस्ट को स्वीकार करें
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    // Vercel Environment Variables से API टोकन लें
    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
    if (!REPLICATE_API_TOKEN) {
        return res.status(500).json({ error: 'API token is not configured on the server.' });
    }

    // फ्रंटएंड से भेजे गए डेटा को लें
    const { text, language, audioDataUrl } = req.body;

    try {
        // Replicate पर एक नई प्रेडिक्शन (job) शुरू करें
        const startResponse = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // यह Coqui XTTS v2 वॉइस क्लोनिंग मॉडल का वर्जन है
                version: "3495203c3b06c8889a721342a781033230a1334c2a412cb591a6202479e0a6d5",
                input: {
                    text: text,
                    speaker_wav: audioDataUrl, // Base64 encoded audio data
                    language: language,
                },
            }),
        });

        const startData = await startResponse.json();
        if (startResponse.status !== 201) {
            // अगर Replicate से कोई एरर आता है, तो उसे फ्रंटएंड पर भेजें
            return res.status(500).json({ error: startData.detail });
        }

        const predictionUrl = startData.urls.get;
        let finalResult = null;

        // जब तक परिणाम "succeeded" या "failed" नहीं हो जाता, तब तक हर सेकंड में चेक करें
        while (!finalResult || (finalResult.status !== 'succeeded' && finalResult.status !== 'failed')) {
            // 1 सेकंड का इंतज़ार
            await new Promise(resolve => setTimeout(resolve, 1000)); 
            
            const pollResponse = await fetch(predictionUrl, {
                headers: {
                    'Authorization': `Token ${REPLICATE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            finalResult = await pollResponse.json();

            // अगर जॉब फेल हो जाती है, तो एरर भेजें
            if (finalResult.status === 'failed') {
                return res.status(500).json({ error: finalResult.error });
            }
        }
        
        // अगर जॉब सफल हो जाती है, तो ऑडियो का URL वापस भेजें
        res.status(200).json({ audio_url: finalResult.output });

    } catch (error) {
        // अगर कोई और सर्वर एरर आता है, तो उसे भेजें
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
}
