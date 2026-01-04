const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
// Auth removed for standalone public API
const { apiLimiter } = require('../middleware/rateLimiter');

// Configuration
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
  percentages: object      // { 0: 10.2, 1: 9.5, ..., over2: 60.5, ... }
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
const last = data.digits[data.digits.length - 1];
const prev = data.digits[data.digits.length - 2];
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

        if (keys.length === 0) {
            console.warn('⚠️ No Gemini API keys found. Returning mock response.');
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
        // Try each key in the pool if one fails with 429
        for (let attempt = 0; attempt < keys.length; attempt++) {
            const currentKey = keys[keyIndex % keys.length];
            console.log(`🤖 AI API: Attempt ${attempt + 1} using Key Index ${keyIndex % keys.length}`);

            try {
                const response = await fetch(`${GEMINI_API_URL}?key=${currentKey}`, {
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
                    console.warn(`⚠️ Key ${keyIndex % keys.length} hit rate limit (429). Rotating...`);
                    keyIndex++; // Move to next key for next attempt
                    lastError = "Rate limit exceeded on all available keys.";
                    continue; // Try next iteration
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ Gemini API Error (${response.status}): ${errorText}`);
                    throw new Error(`Gemini API Error: ${errorText}`);
                }

                const responseData = await response.json();
                let aiOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';

                if (isAnalyze) {
                    return res.json({ summary: aiOutput.trim() });
                } else {
                    let generatedCode = aiOutput.replace(/```javascript/g, '').replace(/```/g, '').trim();
                    const dangerousKeywords = ['eval', 'Function', 'import', 'process', 'window', 'document'];
                    if (dangerousKeywords.some(kw => generatedCode.includes(kw))) {
                        return res.status(400).json({ error: 'Generated code failed security check.' });
                    }
                    return res.json({ code: generatedCode });
                }

            } catch (err) {
                lastError = err.message;
                // If it's not a 429, we might still want to try another key if it's a transient network issue
                // but for now, we'll only rotate on 429 or if explicitly desired.
                console.error(`❌ Attempt failed: ${err.message}`);
                keyIndex++;
            }
        }

        // if we reach here, all keys failed
        throw new Error(lastError || "All API keys in pool failed.");

    } catch (error) {
        console.error('AI Generation Error:', error);
        res.status(500).json({ error: `Failed to generate strategy: ${error.message}` });
    }
});

module.exports = router;
