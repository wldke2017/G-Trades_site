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
You are the lead Quant Developer for Ghost Trades. Your mission is to convert complex trading strategy descriptions into high-performance, sandboxed JavaScript function bodies with 100% accuracy, specializing in DIGIT TRADES.

AVAILABLE DATA (the 'data' object):
- data.symbol (string), data.tick (number), data.lastDigit (number)
- data.digits: number[] (last 1000 last digits)

DIGIT TRADING API (signal('TYPE', stake, symbol, [barrier])):
- DIGITOVER/UNDER, MATCH/DIFF (requires barrier 0-9)
- DIGITEVEN/ODD (no barrier)
- CALL/PUT (rise/fall)
- For stake, ALWAYS pass 'null' (the system handles money management).

PERSISTENT MEMORY (data.memory):
- .get(key, default), .set(key, value), .increment(key), .delete(key)
- USE THIS for streaks, waiting periods, and multi-tick sequences.

--- BEST PRACTICES for Multi-Tick / Sequential Logic ---
When a user asks to "wait for X ticks", use this pattern:
1. TRIGGER TICK: Set memory to 1: data.memory.set('wait_step', 1);
2. SUBSEQUENT TICKS:
   let step = data.memory.get('wait_step', 0);
   if (step > 0) {
      if (step === TARGET_STEP) { 
          signal(...); 
          data.memory.delete('wait_step'); // Reset after execution
      } else { 
          data.memory.increment('wait_step'); 
      }
   }

EXAMPLE 1 (Sequence): "If digit 0 appears, wait 2 ticks and buy Match 7."
if (data.lastDigit === 0) {
    data.memory.set('wait_step', 1);
    log("Digit 0 detected. Starting 2-tick sequence.", "info");
}
let step = data.memory.get('wait_step', 0);
if (step > 0) {
    if (step === 2) { // The wait is over
        signal('DIGITMATCH', null, data.symbol, 7);
        log("Sequence complete. Buying Match 7.", "success");
        data.memory.delete('wait_step');
    } else {
        data.memory.increment('wait_step');
    }
}

EXAMPLE 2 (Cold Digit): "Over 5 if 7 hasn't appeared in 20 ticks."
const history = data.digits.slice(-20);
if (!history.includes(7)) {
    signal('DIGITOVER', null, data.symbol, 5);
    log("7 is cold (20 ticks). Buying Over 5.", "success");
}

NO markdown highlighting. Output pure JavaScript only.
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

// Helper to clean AI output
const cleanOutput = (text) => {
    let result = text;
    // Remove markdown code fences
    result = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
    // Remove common "thinking" markers
    result = result.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    
    // Remove labels and delimiters (flexible regex handles colon or no colon)
    result = result.replace(/^(JAVASCRIPT BODY|CODE ONLY|CODE|ANALYSIS|SUMMARY|### (CODE|SUMMARY) START ###)[:\s-]*/im, '');
    
    // Line-by-line failsafe to remove non-code headers
    const lines = result.split('\n');
    while (lines.length > 0) {
        const line = lines[0].trim();
        if (line === '' || line.startsWith('###') || line.toUpperCase().includes('CODE START') || line.toUpperCase().includes('SUMMARY START')) {
            lines.shift();
        } else {
            break;
        }
    }
    result = lines.join('\n');

    // Failsafe: if the code starts with a property-like 'code:', strip it
    if (result.trim().toLowerCase().startsWith('code:')) {
        result = result.replace(/^code:\s*/i, '');
    }

    // If the AI returned an object-like string accidentally
    const trimmed = result.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.includes('"code"')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.code) result = parsed.code;
        } catch(e) {}
    }
    return result.trim();
};

router.post('/generate', apiLimiter, async (req, res) => {
    try {
        const { prompt, mode } = req.body;
        const keys = getKeys();

        if (keys.length === 0 && !GROQ_API_KEY) {
            console.warn('⚠️ No AI API keys found. Returning mock response.');
            return res.json({
                code: mode === 'analyze' ? null : "// MOCK MODE: API Key missing\nlog('Mock Strategy Active');",
                summary: mode === 'analyze' ? "MOCK SUMMARY: This strategy will trade based on even digits." : null
            });
        }

        if (!prompt || typeof prompt !== 'string' || prompt.length > 2000) {
            return res.status(400).json({ error: 'Invalid prompt (max 2000 chars)' });
        }

        const isAnalyze = mode === 'analyze';
        const systemPrompt = isAnalyze ? SYSTEM_PROMPT_ANALYZE : SYSTEM_PROMPT_CODE;
        const delimiter = isAnalyze ? '### SUMMARY START ###' : '### CODE START ###';

        let lastError = null;

        // ===== PHASE 1: TRY GEMINI =====
        if (keys.length > 0) {
            for (const model of GEMINI_MODELS) {
                const apiUrl = `${GEMINI_BASE_URL}/${model}:generateContent`;

                for (let attempt = 0; attempt < keys.length; attempt++) {
                    const currentKey = keys[keyIndex % keys.length];
                    try {
                        const response = await fetch(`${apiUrl}?key=${currentKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{
                                        text: `${systemPrompt} \n\nUSER PROMPT: "${prompt}"\n\n${delimiter} `
                                    }]
                                }],
                                generationConfig: {
                                    temperature: 0.1,
                                    maxOutputTokens: 1024,
                                }
                            })
                        });

                        if (response.status === 429) {
                            keyIndex++;
                            continue;
                        }

                        if (!response.ok) {
                            if (response.status === 404) break;
                            throw new Error(`Gemini ${response.status}`);
                        }

                        const responseData = await response.json();
                        let aiOutput = "";
                        if (responseData.candidates?.[0]?.content?.parts) {
                            aiOutput = responseData.candidates[0].content.parts.map(p => p.text || "").join("\n");
                        }

                        const cleaned = cleanOutput(aiOutput);

                        if (isAnalyze) {
                            return res.json({ summary: cleaned });
                        } else {
                            // Security check
                            const dangerousKeywords = ['eval', 'Function', 'import', 'process'];
                            if (dangerousKeywords.some(kw => cleaned.includes(kw))) {
                                return res.status(400).json({ error: 'Generated code failed security check.' });
                            }

                            // Syntax check
                            try {
                                new Function('data', 'signal', 'log', '"use strict";\n' + cleaned);
                            } catch (syntaxError) {
                                console.warn(`❌ [GEMINI] Syntax Error: ${syntaxError.message}`);
                                lastError = `Syntax Error: ${syntaxError.message} | Snippet: ${cleaned.substring(0, 30)}...`;
                                continue;
                            }

                            return res.json({ code: cleaned });
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
            for (const model of GROQ_MODELS) {
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
                                content: `${prompt}\n\n${delimiter}`
                            }],
                            temperature: 0.2,
                            max_tokens: 1024
                        })
                    });

                    if (!response.ok) continue;

                    const responseData = await response.json();
                    let aiOutput = responseData.choices?.[0]?.message?.content || '';
                    const cleaned = cleanOutput(aiOutput);

                    if (isAnalyze) {
                        return res.json({ summary: cleaned });
                    } else {
                        const dangerousKeywords = ['eval', 'Function', 'import', 'process'];
                        if (dangerousKeywords.some(kw => cleaned.includes(kw))) {
                            return res.status(400).json({ error: 'Generated code failed security check.' });
                        }

                        try {
                            new Function('data', 'signal', 'log', '"use strict";\n' + cleaned);
                        } catch (syntaxError) {
                            console.warn(`❌ [GROQ] Syntax Error: ${syntaxError.message}`);
                            lastError = `Syntax Error: ${syntaxError.message} | Snippet: ${cleaned.substring(0, 30)}...`;
                            continue;
                        }

                        return res.json({ code: cleaned });
                    }
                } catch (err) {
                    lastError = err.message;
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
