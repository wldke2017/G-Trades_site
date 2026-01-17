const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
// Using a simple random generator since we cannot easily install new packages.
const generateId = () => Math.random().toString(36).substr(2, 9);
const STRATEGIES_FILE = path.join(__dirname, '../saved_strategies.json');
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

TRADING SIGNALS (exactly one call per condition match):
- signal('CALL' | 'PUT' | 'DIGITEVEN' | 'DIGITODD', stake)
- signal('DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF', stake, barrier)

ADVANCED TECHNIQUES:
1. Digit Percentage: If user says "trade if digit 2 is trending low", use data.percentages[2] < 5.0
2. Sequence Matching: const last3 = data.digits.slice(-3).join(''); if (last3 === '888') ...
3. Relative Change: const delta = data.tick - previousTick; (Note: You must track previousTick via local variable if requested)
4. Barrier Optimization: For 'DIGITOVER 5', the barrier is 5.

CRITICAL CONSTRAINTS:
- Output ONLY pure JS code. NO markdown formatting. NO wrapping function.
- DO NOT use any browser globals (window, document, etc.) or restricted keywords.
- ALWAYS use console-style logging via log("Message: " + values) to explain WHY a trade was taken.
- If a strategy is logically impossible or unsafe, use log('Error: [Reason]') and do not signal.

EXAMPLE: "If digit 0 percentage is < 5 and last digit is 5, buy Digit Differ 0."
const pct0 = data.percentages[0];
const last = data.lastDigit;
if (pct0 < 5 && last === 5) {
    signal('DIGITDIFF', 1, 0);
    log(\`Strategy Match: Dig0(\${pct0}%) < 5% & LastDigit: \${last}\`);
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

// ==========================================
// STRATEGY MANAGEMENT ENDPOINTS
// ==========================================

// Helper to read strategies
const readStrategies = () => {
    try {
        if (!fs.existsSync(STRATEGIES_FILE)) {
            fs.writeFileSync(STRATEGIES_FILE, JSON.stringify({ strategies: [] }, null, 2));
            return [];
        }
        const data = fs.readFileSync(STRATEGIES_FILE, 'utf8');
        return JSON.parse(data).strategies || [];
    } catch (err) {
        console.error('Error reading strategies:', err);
        return [];
    }
};

// Helper to write strategies
const writeStrategies = (strategies) => {
    try {
        fs.writeFileSync(STRATEGIES_FILE, JSON.stringify({ strategies }, null, 2));
        return true;
    } catch (err) {
        console.error('Error writing strategies:', err);
        return false;
    }
};

// GET /strategies - List all saved strategies
router.get('/strategies', (req, res) => {
    const strategies = readStrategies();
    // Return only necessary fields for the list
    const list = strategies.map(s => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
    res.json(list);
});

// GET /strategies/:id - Get specific strategy details
router.get('/strategies/:id', (req, res) => {
    const strategies = readStrategies();
    const strategy = strategies.find(s => s.id === req.params.id);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });
    res.json(strategy);
});

// POST /strategies - Save a new strategy
router.post('/strategies', (req, res) => {
    const { name, code, prompt } = req.body;

    if (!name || !code) {
        return res.status(400).json({ error: 'Name and Code are required' });
    }

    if (name.length > 50) return res.status(400).json({ error: 'Name too long (max 50 chars)' });
    if (code.length > 10000) return res.status(400).json({ error: 'Code too long (max 10000 chars)' });

    const strategies = readStrategies();

    if (strategies.length >= 100) {
        return res.status(400).json({ error: 'Storage limit reached (max 100 strategies). Delete some to save new ones.' });
    }

    const newStrategy = {
        id: generateId(),
        name: name.trim(),
        code,
        prompt: prompt || '',
        createdAt: new Date().toISOString()
    };

    strategies.push(newStrategy);
    if (writeStrategies(strategies)) {
        res.json(newStrategy);
    } else {
        res.status(500).json({ error: 'Failed to save strategy' });
    }
});

// DELETE /strategies/:id - Delete a strategy
router.delete('/strategies/:id', (req, res) => {
    let strategies = readStrategies();
    const initialLength = strategies.length;
    strategies = strategies.filter(s => s.id !== req.params.id);

    if (strategies.length === initialLength) {
        return res.status(404).json({ error: 'Strategy not found' });
    }

    if (writeStrategies(strategies)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to delete strategy' });
    }
});

module.exports = router;
