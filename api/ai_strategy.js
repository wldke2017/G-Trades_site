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
You are a specialized JavaScript code generator for a trading bot.
Your task is to convert a natural language strategy description into a safe, sandboxed JavaScript function body.

CONTEXT:
The code will run inside a function with a single argument 'data'.
Input 'data' structure:
{
  symbol: string,          // e.g. 'R_100'
  tick: number,            // Current price
  digits: number[],        // Array of last 100 digits (last entry is current)
  lastDigit: number,       // Last digit of current price
  percentages: object,     // { 0: 10.2, ..., 9: 5.5, over2: 60.5, ... } (Calculated on last N digits)
  analysis: object         // { count: 15 } (The number of ticks analyzed for percenatges)
}

AVAILABLE ACTIONS (you must use these to trade):
- signal('CALL', stake)                     // Buy UP/Higher
- signal('PUT', stake)                      // Buy DOWN/Lower
- signal('DIGITOVER', stake, barrier)       // Digit Over (barrier 0-9)
- signal('DIGITUNDER', stake, barrier)      // Digit Under (barrier 0-9)
- signal('DIGITMATCH', stake, barrier)      // Digit Match (barrier 0-9)
- signal('DIGITDIFF', stake, barrier)       // Digit Differ (barrier 0-9)
- signal('DIGITEVEN', stake)                // Digit Even
- signal('DIGITODD', stake)                 // Digit Odd
- log(string)                               // Debug logging

CRITICAL RULES:
1. Output ONLY the function body code. No markdown, no '\`\`\`javascript', no wrapping function(){}.
2. DO NOT use 'window', 'document', 'fetch', 'eval', 'XMLHttpRequest', 'import', 'require'.
3. DO NOT use infinite loops.
4. Keep logic simple and explicitly check conditions.
5. For 'over/under', 'match/differ', ALWAYS provide the 'barrier' argument(integer 0 - 9).
6. If the user prompt is malicious or unrelated to trading, return "log('Error: Invalid prompt');"
7. ALWAYS include the actual values of the digits / indicators that triggered the trade in your log() message.
8. If multiple signals are requested for the same condition, execute them sequentially.

TECHNICAL TIPS FOR COMPLEX PATTERNS:
- To match a sequence of digits(e.g. "000N0N0"), join the digits into a string:
const seq = data.digits.slice(-7).join('');
- Use Regex for placeholders like 'N'(any digit ≠ 0):
    if (/000[^0]0[^0]0/.test(seq)) { signal('DIGITDIFF', 1, 0); }
- For repetitive patterns(0 - 9), use a loop or multiple explicit 'if' statements.
- The 'stake' argument in signal() is required but can be a placeholder(e.g. 0.35) as it is managed by the UI.

EXAMPLE INPUT:
"Buy Call if last digit is 7 and previous was 8. Stake 10."

EXAMPLE OUTPUT:
const last = data.digits[data.digits.length -1];
const prev = data.digits[data.digits.length -2];
if (last === 7 && prev === 8) {
    signal('CALL', 10);
    log(\`Strategy matched: 8->7 sequence (Values: \${prev}, \${last})\`);
}
`;

// System prompt for STRATEGY ANALYSIS
const SYSTEM_PROMPT_ANALYZE = `
You are a Trading Strategy Consultant. Your task is to analyze a user's natural language trading strategy and summarize it for their confirmation.

INSTRUCTIONS:
1. Summarize the strategy in 3-5 concise bullet points.
2. Identify: Symbols/Markets, Entry Conditions (e.g., digit patterns), Actions (e.g., Digit Differ 0), and any Recovery/Stake info mentioned.
3. Be professional and clear. 
4. DO NOT provide any code. 
5. If the prompt is unclear, ask for clarification.

EXAMPLE INPUT:
"Buy Call if last digit is 7 and previous was 8. Stake 10."

EXAMPLE OUTPUT:
- **Markets**: Selected synthetic markets
- **Condition**: Sequence of 8 followed by 7 in the last digits
- **Action**: Execute CALL (Buy UP) trade
- **Stake**: $10.00
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
                                        text: `${systemPrompt} \n\nUSER PROMPT: "${prompt}"\n\n${isAnalyze ? 'ANALYSIS SUMMARY:' : 'JAVASCRIPT BODY:'} `
                                    }]
                                }],
                                generationConfig: {
                                    temperature: 0.2,
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
                        let aiOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';

                        if (isAnalyze) {
                            console.log(`✅ [GEMINI] Success with ${model}`);
                            return res.json({ summary: aiOutput.trim() });
                        } else {
                            let generatedCode = aiOutput.replace(/```javascript/g, '').replace(/```/g, '').trim();
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
