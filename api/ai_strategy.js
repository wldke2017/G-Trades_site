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
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
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
You are a lead Quant Developer for Ghost Trades. Your task is to convert complex trading strategy descriptions into high-performance, sandboxed JavaScript function bodies with 100% accuracy.

AVAILABLE DATA (the 'data' object):
- data.symbol: string (current trading symbol)
- data.tick: number (current price)
- data.digits: number[] (last 1000 digits)
- data.lastDigit: number (last digit of current tick)

PRE-CALCULATED INDICATORS (data.indicators):
- You must use these instead of manually calculating them.
- data.indicators.RSI_14 (Number, 0-100)
- data.indicators.SMA_20 (Number)
- data.indicators.EMA_20 (Number)
- data.indicators.SMA_50 (Number)
- data.indicators.BOLLINGER_20 (Object: { upper, lower, middle })

PERSISTENT MEMORY (data.memory):
- Use this to track states across ticks (trading conditions, streaks, wait times).
- data.memory.get('key', defaultValue)
- data.memory.set('key', value)
- data.memory.increment('key', amount)
- data.memory.delete('key')

TRADING SIGNALS (exactly one call per condition match):
- ONLY use the following exact signature: signal('TYPE', null, data.symbol, [barrier])
- Standard: signal('CALL', null, data.symbol) or signal('PUT', null, data.symbol)
- Digit Math: signal('DIGITEVEN', null, data.symbol)
- Digit High/Low: signal('DIGITOVER', null, data.symbol, 5)

CONSTRAINTS & BEST PRACTICES:
1. Trade Types: Use the 'null' parameter exclusively for the stake (the UI handles it). Example: signal('CALL', null, data.symbol).
2. NEVER use markdown highlighting tags. Output pure Javascript logic only. 
3. Always explain your trades with log(): log("RSI crossed 30. Buying CALL.", "success");
4. Be precise. If the user wants a Bollinger Band reversal, check if data.tick <= data.indicators.BOLLINGER_20.lower.

EXAMPLE (Specific market & pattern): "Trade Over 5 on Vol 100 once if last digit is 0."
if (data.symbol === 'R_100' && data.lastDigit === 0 && !data.memory.get('hasRun')) {
    signal('DIGITOVER', null, 'R_100', 5);
    data.memory.set('hasRun', true);
    log("Vol 100 Over 5 triggered on digit 0.", "success");
}
`;

// System prompt for STRATEGY ANALYSIS
const SYSTEM_PROMPT_ANALYZE = `
You are the Ghost AI Trading Consultant. Analyze the user's strategy and provide a high-level technical summary.

You are aware that the Ghost Trades engine now supports:
- Technical Indicators: RSI_14, SMA_20, EMA_20, SMA_50, Bollinger Bands (20,2).
- Persistent Memory: Tracking states, wait times, and streaks across ticks.
- Dynamic Symbols: Supporting Volatility (R_X, 1HZX) and Jump Indices.

FORMAT:
- **Strategy Name**: [Catchy name]
- **Market Conditions**: [What happens in the market (e.g. High Volatility, Trend Following)]
- **Technical Logic**: [Identify indicators and conditions used]
- **Execution Plan**: [Step-by-step logic of entries and memory usage]
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

                        // Robust response extraction
                        let aiOutput = "";
                        if (responseData.candidates?.[0]?.content?.parts) {
                            aiOutput = responseData.candidates[0].content.parts
                                .map(p => p.text || "")
                                .join("\n");
                        }

                        const cleanOutput = (text) => {
                            let result = text;
                            result = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
                            result = result.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
                            return result.trim();
                        };

                        if (isAnalyze) {
                            console.log(`✅ [GEMINI] Success with ${model}`);
                            return res.json({ summary: cleanOutput(aiOutput) });
                        } else {
                            let generatedCode = cleanOutput(aiOutput);
                            const dangerousKeywords = ['eval', 'Function', 'import', 'process'];
                            if (dangerousKeywords.some(kw => generatedCode.includes(kw))) {
                                return res.status(400).json({ error: 'Generated code failed security check.' });
                            }

                            try {
                                new Function('data', 'signal', 'log', '"use strict";\n' + generatedCode);
                            } catch (syntaxError) {
                                console.warn(`❌ [GEMINI] Syntax Error in generated code: ${syntaxError.message}`);
                                lastError = `Syntax Error: ${syntaxError.message}`;
                                continue;
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
                        const cleanOutput = (text) => {
                            let result = text;
                            result = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
                            result = result.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
                            return result.trim();
                        };

                        let generatedCode = cleanOutput(aiOutput);
                        const dangerousKeywords = ['eval', 'Function', 'import', 'process'];
                        if (dangerousKeywords.some(kw => generatedCode.includes(kw))) {
                            return res.status(400).json({ error: 'Generated code failed security check.' });
                        }

                        try {
                            new Function('data', 'signal', 'log', '"use strict";\n' + generatedCode);
                        } catch (syntaxError) {
                            console.warn(`❌ [GROQ] Syntax Error in generated code: ${syntaxError.message}`);
                            lastError = `Syntax Error: ${syntaxError.message}`;
                            continue;
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
