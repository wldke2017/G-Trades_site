const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
// Auth removed for standalone public API
const { apiLimiter } = require('../middleware/rateLimiter');

// Gemini Configuration
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-1.0-pro'
];

// Groq Configuration (Fallback Provider)
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODELS = [
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant'
];

// Key Management
let keyIndex = 0;
const getKeys = () => {
    const multiKeys = process.env.GEMINI_API_KEYS;
    if (multiKeys) return multiKeys.split(',').map(k => k.trim()).filter(k => k);
    return [process.env.GEMINI_API_KEY].filter(k => k);
};

// System prompt for CODE GENERATION
const SYSTEM_PROMPT_CODE = `
You are a lead Quant Developer for Ghost Trades. Your task is to convert complex trading strategy descriptions into high-performance, sandboxed JavaScript function bodies.

DATA CONTEXT (the 'data' object):
- data.symbol: string (current trading symbol)
- data.tick: number (current price)
- data.digits: number[] (last 100 digits)
- data.lastDigit: number (the last digit of the current tick)
- data.percentages: object { 0..9: percentage, over0..over9: percentage }
- data.analysis.count: number (lookback period for percentages)

SYMBOL MAPPING (data.symbol):
- Volatility 10/25/50/75/100: 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'
- Volatility 1s (1HZ): '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'

TRADING SIGNALS (exactly one call per condition match):
- signal('CALL' | 'PUT' | 'DIGITEVEN' | 'DIGITODD', stake)
- signal('DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF', stake, barrier)

CONSTRAINTS & BEST PRACTICES:
1. Symbol Focus: If the user specifies a market, ALWAYS wrap your logic in: if (data.symbol === 'CORRECT_SYMBOL') { ... }
2. Multi-Trade Blocking: The platform has a 5-second lock per market. If the user asks for "simultaneous" trades (e.g., Over 1 and Under 8), they will be blocked if triggered on the same tick. If requested, write logic to space them out across different ticks or log that it's currently limited by safety gates.
3. Single Execution: For "once" requests, use a global-persistent flag: if (!window.strategyExecuted) { ... window.strategyExecuted = true; }
4. Persistence: You can use 'window.customState = ...' to track streaks or states across ticks.
5. Logging: ALWAYS explain WHY a trade was taken via log().

EXAMPLE (Specific market & pattern): "Trade Over 5 on Vol 100 once if last digit is 0."
if (data.symbol === 'R_100' && data.lastDigit === 0 && !window.hasRun) {
    signal('DIGITOVER', 1, 5);
    window.hasRun = true;
    log("Vol 100 Over 5 triggered on digit 0. Execution locked.");
}
`;

// System prompt for STRATEGY ANALYSIS
const SYSTEM_PROMPT_ANALYZE = `
You are the Ghost AI Trading Consultant. Analyze the user's strategy and provide a high-level technical summary.

FORMAT:
- **Strategy Name**: [Catchy name]
- **Market Conditions**: [What happens in the market]
- **Entry Logic**: [Detailed technical trigger]
- **Action**: [Trade type and risk]
- **Expert Verdict**: [1-sentence assessment of the strategy's risk profile]

Keep it concise, professional, and confidence-inspiring.
`;

router.post('/generate', apiLimiter, async (req, res) => {
    try {
        const { prompt, mode } = req.body;
        const keys = getKeys();

        if (keys.length === 0 && !GROQ_API_KEY) {
            console.warn('⚠️ No AI API keys found. Returning mock response.');
            return res.json({
                code: mode === 'analyze' ? null : `// MOCK MODE: API Key missing\nlog('Mock Strategy Active');`,
                summary: mode === 'analyze' ? "MOCK SUMMARY: This strategy will trade based on even digits." : null
            });
        }

        if (!prompt || typeof prompt !== 'string' || prompt.length > 2000) {
            return res.status(400).json({ error: 'Invalid prompt (max 2000 chars)' });
        }

        const isAnalyze = mode === 'analyze';
        const systemPrompt = isAnalyze ? SYSTEM_PROMPT_ANALYZE : SYSTEM_PROMPT_CODE;

        let lastError = null;

        // ===== PHASE 1: TRY GEMINI =====
        if (keys.length > 0) {
            console.log(`🔷 [GEMINI] Trying ${GEMINI_MODELS.length} models with ${keys.length} keys...`);

            for (const model of GEMINI_MODELS) {
                const apiUrl = `${GEMINI_BASE_URL}/${model}:generateContent`;

                for (let attempt = 0; attempt < keys.length; attempt++) {
                    const currentKey = keys[keyIndex % keys.length];
                    console.log(`🤖 [GEMINI] ${model} / Key ${keyIndex % keys.length}`);

                    try {
                        const response = await fetch(`${apiUrl}?key=${currentKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{
                                        text: `${systemPrompt} \n\nUSER PROMPT: "${prompt}"\n\n${isAnalyze ? 'CONFIRMATION SUMMARY:' : 'JAVASCRIPT BODY (CODE ONLY):'} `
                                    }]
                                }],
                                generationConfig: {
                                    temperature: 0.1, // Lower temperature for more stable code
                                    maxOutputTokens: 1024,
                                }
                            })
                        });

                        if (response.status === 429) {
                            console.warn(`⚠️ [GEMINI] Quota exhausted`);
                            keyIndex++;
                            continue;
                        }

                        if (!response.ok) {
                            if (response.status === 404) break;
                            throw new Error(`Gemini ${response.status}`);
                        }

                        const responseData = await response.json();

                        // Robust response extraction (handles different GEMINI response formats and thinking blocks)
                        let aiOutput = "";
                        if (responseData.candidates?.[0]?.content?.parts) {
                            aiOutput = responseData.candidates[0].content.parts
                                .map(p => p.text || "")
                                .join("\n");
                        }

                        // Clean up output: Remove markdown code blocks and any "thinking" artifacts
                        const cleanOutput = (text) => {
                            let result = text;
                            // Remove markdown code fences
                            result = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
                            // Remove common "thinking" markers if they leaked
                            result = result.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
                            return result.trim();
                        };

                        if (isAnalyze) {
                            console.log(`✅ [GEMINI] Success with ${model}`);
                            return res.json({ summary: cleanOutput(aiOutput) });
                        } else {
                            let generatedCode = cleanOutput(aiOutput);
                            const dangerousKeywords = ['eval', 'Function', 'import', 'process', 'window', 'document'];
                            if (dangerousKeywords.some(kw => generatedCode.includes(kw))) {
                                return res.status(400).json({ error: 'Generated code failed security check.' });
                            }
                            console.log(`✅ [GEMINI] Success with ${model}`);
                            return res.json({ code: generatedCode });
                        }

                    } catch (err) {
                        lastError = err.message;
                        keyIndex++;
                    }
                }
            }
        }

        // ===== PHASE 2: TRY GROQ =====
        if (GROQ_API_KEY) {
            console.log(`🟢 [GROQ] Gemini exhausted. Switching to Groq...`);

            for (const model of GROQ_MODELS) {
                console.log(`🤖 [GROQ] Trying ${model}`);

                try {
                    const response = await fetch(GROQ_BASE_URL, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${GROQ_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{
                                role: 'system',
                                content: systemPrompt
                            }, {
                                role: 'user',
                                content: `${prompt}\n\n${isAnalyze ? 'ANALYSIS SUMMARY:' : 'JAVASCRIPT BODY:'}`
                            }],
                            temperature: 0.2,
                            max_tokens: 1024
                        })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(`❌ [GROQ] ${response.status}: ${errorText}`);
                        continue;
                    }

                    const responseData = await response.json();
                    let aiOutput = responseData.choices?.[0]?.message?.content || '';

                    if (isAnalyze) {
                        console.log(`✅ [GROQ] Success with ${model}`);
                        return res.json({ summary: aiOutput.trim() });
                    } else {
                        let generatedCode = aiOutput.replace(/```javascript/g, '').replace(/```/g, '').trim();
                        const dangerousKeywords = ['eval', 'Function', 'import', 'process', 'window', 'document'];
                        if (dangerousKeywords.some(kw => generatedCode.includes(kw))) {
                            return res.status(400).json({ error: 'Generated code failed security check.' });
                        }
                        console.log(`✅ [GROQ] Success with ${model}`);
                        return res.json({ code: generatedCode });
                    }

                } catch (err) {
                    lastError = err.message;
                    console.error(`❌ [GROQ] ${model}: ${err.message}`);
                }
            }
        }

        throw new Error(lastError || "All AI providers exhausted.");

    } catch (error) {
        console.error('AI Generation Error:', error);
        res.status(500).json({ error: `Failed to generate strategy: ${error.message}` });
    }
});
module.exports = router;
