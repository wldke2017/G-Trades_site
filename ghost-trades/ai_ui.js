// ===================================
// AI STRATEGY UI CONTROLLER
// ===================================

const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isProduction = window.location.hostname === 'ghost-trades.site';
const AI_API_ENDPOINT = isProduction
    ? 'https://ghost-trades.site/api/ai/generate'
    : (isLocalDev ? 'http://localhost:4000/api/ai/generate' : '/api/ai/generate');

const AI_STRATEGY_API = isProduction
    ? 'https://ghost-trades.site/api/ai/strategies'
    : (isLocalDev ? 'http://localhost:4000/api/ai/strategies' : '/api/ai/strategies');

// UI Elements
let aiPromptInput, aiGenerateBtn, aiCodeEditor, aiRunBtn, aiStopBtn, aiLogContainer, aiStatusIndicator, aiPromptCounter;
let aiAnalysisContainer, aiSummaryDisplay, aiConfirmBtn, aiCancelBtn, aiAnalysisStatus; // Consultant Elements
let aiMarketCheckboxes, aiSelectAllBtn, aiClearMarketsBtn; // New Elements
let aiSmartRecoveryToggle, aiMartingaleContainer, aiPayoutContainer, aiPayoutAuto; // Smart Recovery Elements
let aiStrategyDropdown, aiSaveStrategyBtn, aiLoadStrategyBtn, aiDeleteStrategyBtn; // Old Reference - Deprecated in favor of list
let aiStrategiesList; // New Strategy List Container

document.addEventListener('DOMContentLoaded', () => {
    initializeAIUI();
});

function initializeAIUI() {
    // Get all DOM elements
    aiPromptInput = document.getElementById('ai-prompt-input');
    aiGenerateBtn = document.getElementById('ai-generate-btn');
    aiCodeEditor = document.getElementById('ai-code-editor');
    aiRunBtn = document.getElementById('ai-run-btn');
    aiStopBtn = document.getElementById('ai-stop-btn');
    aiLogContainer = document.getElementById('ai-log-container');
    aiStatusIndicator = document.getElementById('ai-status-indicator');
    aiPromptCounter = document.getElementById('ai-prompt-counter');

    // Consultant Elements
    aiAnalysisContainer = document.getElementById('ai-analysis-container');
    aiSummaryDisplay = document.getElementById('ai-summary-display');
    aiConfirmBtn = document.getElementById('ai-confirm-generate-btn');
    aiCancelBtn = document.getElementById('ai-cancel-analysis-btn');
    aiAnalysisStatus = document.getElementById('ai-analysis-status');

    // Market Selector Elements
    aiMarketCheckboxes = document.getElementById('ai-market-checkboxes');
    aiSelectAllBtn = document.getElementById('ai-select-all-markets');
    aiClearMarketsBtn = document.getElementById('ai-clear-markets');

    // Smart Recovery Elements
    aiSmartRecoveryToggle = document.getElementById('ai-smart-recovery-toggle');
    aiMartingaleContainer = document.getElementById('ai-martingale-container');
    aiPayoutContainer = document.getElementById('ai-payout-container');
    aiPayoutAuto = document.getElementById('ai-payout-auto');

    // Strategy Management Elements
    // Strategy Management Elements
    // aiStrategyDropdown = document.getElementById('ai-strategy-dropdown'); // Removed
    aiStrategiesList = document.getElementById('ai-strategies-list');
    aiSaveStrategyBtn = document.getElementById('ai-save-strategy-btn');
    // aiLoadStrategyBtn = document.getElementById('ai-load-strategy-btn'); // Removed
    // aiDeleteStrategyBtn = document.getElementById('ai-delete-strategy-btn'); // Removed

    // Log initialization status
    console.log('🤖 AI Strategy UI Initialization:', {
        promptInput: !!aiPromptInput,
        generateBtn: !!aiGenerateBtn,
        codeEditor: !!aiCodeEditor,
        runBtn: !!aiRunBtn,
        stopBtn: !!aiStopBtn,
        logContainer: !!aiLogContainer,
        statusIndicator: !!aiStatusIndicator,
        marketCheckboxes: !!aiMarketCheckboxes,
        selectAllBtn: !!aiSelectAllBtn,
        clearMarketsBtn: !!aiClearMarketsBtn
    });

    // Add Event Listeners (with null checks)
    if (aiGenerateBtn) {
        aiGenerateBtn.addEventListener('click', handleAnalyzeStrategy);
    } else {
        console.warn('⚠️ AI Analyze Button not found - AI Strategy UI may not be fully loaded');
    }

    if (aiConfirmBtn) {
        aiConfirmBtn.addEventListener('click', handleGenerateCode);
    }

    if (aiCancelBtn) {
        aiCancelBtn.addEventListener('click', resetConsultantUI);
    }

    if (aiPromptInput && aiPromptCounter) {
        aiPromptInput.addEventListener('input', () => {
            const length = aiPromptInput.value.length;
            aiPromptCounter.textContent = `${length} / 2000`;
            aiPromptCounter.style.color = length > 2000 ? '#e74c3c' : (length > 1800 ? '#f39c12' : 'var(--text-muted)');
        });
    }

    if (aiRunBtn) {
        aiRunBtn.addEventListener('click', handleRunStrategy);
    }

    if (aiStopBtn) {
        aiStopBtn.addEventListener('click', handleStopStrategy);
    }

    if (aiSelectAllBtn) {
        aiSelectAllBtn.addEventListener('click', () => toggleAllMarkets(true));
    }

    if (aiClearMarketsBtn) {
        aiClearMarketsBtn.addEventListener('click', () => toggleAllMarkets(false));
    }

    if (aiSmartRecoveryToggle) {
        aiSmartRecoveryToggle.addEventListener('change', toggleSmartRecoveryUI);
        // Initialize UI state
        toggleSmartRecoveryUI();
        toggleSmartRecoveryUI();
    }

    // Strategy Management Event Listeners
    // Strategy Management Event Listeners
    if (aiSaveStrategyBtn) aiSaveStrategyBtn.addEventListener('click', handleSaveStrategy);
    // Load and Delete are now handled via delegation or direct binding in render

    // Load strategies on init
    loadSavedStrategies();

    // Set Initial State
    updateAIStatus('IDLE');

    // RACE CONDITION FIX: If markets already loaded in app.js, populate them now
    if (window.activeSymbols && window.activeSymbols.length > 0) {
        console.log('🔄 AI UI: Active symbols already available, populating market selector...');
        if (typeof window.updateAIMarketSelector === 'function') {
            window.updateAIMarketSelector(window.activeSymbols);
        }
    } else {
        console.log('⏳ AI UI: Waiting for active symbols to load...');
    }

    console.log('✅ AI Strategy UI Initialized Successfully');
}

// Global function to populate markets (Called from app.js when activeSymbols are ready)
window.updateAIMarketSelector = function (activeSymbols) {
    console.log('🔄 AI UI: updateAIMarketSelector called', {
        hasContainer: !!aiMarketCheckboxes,
        symbolCount: activeSymbols ? activeSymbols.length : 0
    });

    if (!aiMarketCheckboxes) {
        console.error('❌ AI UI: Market checkboxes container not found - retrying initialization...');
        // Retry getting the element
        aiMarketCheckboxes = document.getElementById('ai-market-checkboxes');
        if (!aiMarketCheckboxes) {
            console.error('❌ AI UI: Still cannot find market checkboxes container');
            return;
        }
    }

    console.log(`✅ AI UI: Received ${activeSymbols ? activeSymbols.length : 0} symbols for selector.`);
    console.log('🔍 AI UI: Sample symbol structure:', activeSymbols[0]);

    aiMarketCheckboxes.innerHTML = ''; // Clear existing

    if (!activeSymbols || activeSymbols.length === 0) {
        aiMarketCheckboxes.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem; padding: 5px;">No active symbols loaded.</span>';
        console.warn('⚠️ AI UI: No active symbols available');
        return;
    }

    // ALLOWED MARKETS (Whitelist from user request)
    const ALLOWED_MARKETS = [
        'Bear Market Index', 'Bull Market Index',
        'Jump 10 Index', 'Jump 100 Index', 'Jump 25 Index', 'Jump 50 Index', 'Jump 75 Index',
        'Volatility 10 (1s) Index', 'Volatility 10 Index', 'Volatility 100 (1s) Index', 'Volatility 100 Index',
        'Volatility 15 (1s) Index', 'Volatility 25 (1s) Index', 'Volatility 25 Index', 'Volatility 30 (1s) Index',
        'Volatility 50 (1s) Index', 'Volatility 50 Index', 'Volatility 75 (1s) Index', 'Volatility 75 Index', 'Volatility 90 (1s) Index'
    ];

    // Filter active symbols against whitelist
    const supportedSymbols = activeSymbols.filter(symbol => {
        const name = symbol.display_name || symbol.symbol;
        return ALLOWED_MARKETS.includes(name);
    });

    console.log(`🔍 AI UI: Filtered ${supportedSymbols.length} supported symbols from ${activeSymbols.length} total`);

    // Sort alphabetically for clean display
    const sortedSymbols = supportedSymbols.sort((a, b) => {
        const aName = a.display_name || a.symbol;
        const bName = b.display_name || b.symbol;
        return aName.localeCompare(bName);
    });

    let count = 0;
    sortedSymbols.forEach(symbol => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '5px';
        wrapper.style.fontSize = '0.75rem';
        wrapper.style.color = '#cbd5e1';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = symbol.symbol;
        checkbox.id = `ai-chk-${symbol.symbol}`;
        checkbox.checked = true; // Default checked as per user request (Auto-select all supported)

        const label = document.createElement('label');
        label.htmlFor = `ai-chk-${symbol.symbol}`;
        label.textContent = symbol.display_name || symbol.symbol;
        label.style.cursor = 'pointer';

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        aiMarketCheckboxes.appendChild(wrapper);
        count++;
    });

    console.log(`✅ AI UI: Successfully populated ${count} market checkboxes.`);

    if (count === 0) {
        // Show all symbols as fallback if no synthetic found
        console.warn('⚠️ AI UI: No synthetic markets found, showing all symbols');
        activeSymbols.forEach(symbol => {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '5px';
            wrapper.style.fontSize = '0.75rem';
            wrapper.style.color = '#cbd5e1';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = symbol.symbol;
            checkbox.id = `ai-chk-${symbol.symbol}`;

            const label = document.createElement('label');
            label.htmlFor = `ai-chk-${symbol.symbol}`;
            label.textContent = symbol.display_name || symbol.symbol;
            label.style.cursor = 'pointer';

            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);
            aiMarketCheckboxes.appendChild(wrapper);
        });
        console.log(`✅ AI UI: Showing all ${activeSymbols.length} symbols as fallback`);
    }
};

function toggleAllMarkets(check) {
    if (!aiMarketCheckboxes) return;
    const checkboxes = aiMarketCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = check);
}

function getSelectedAIMarkets() {
    if (!aiMarketCheckboxes) return [];
    const checkboxes = aiMarketCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function toggleSmartRecoveryUI() {
    const isSmart = aiSmartRecoveryToggle && aiSmartRecoveryToggle.checked;

    if (aiMartingaleContainer) {
        aiMartingaleContainer.style.display = isSmart ? 'none' : 'flex';
    }

    if (aiPayoutContainer) {
        aiPayoutContainer.style.display = isSmart ? 'flex' : 'none';
    }
}

async function handleAnalyzeStrategy() {
    const prompt = aiPromptInput.value.trim();
    if (!prompt) {
        showToast('Please enter a strategy description.', 'error');
        return;
    }

    console.log('🤖 AI: Analyzing strategy for prompt:', prompt.substring(0, 100) + '...');
    updateAIStatus('ANALYZING');
    aiGenerateBtn.disabled = true;
    aiGenerateBtn.textContent = 'Analyzing...';

    // Reset and show analysis container
    if (aiAnalysisContainer) {
        aiAnalysisContainer.style.display = 'block';
        aiSummaryDisplay.innerHTML = '<div class="loader-small" style="margin: 20px auto;"></div><p style="text-align:center; color: var(--text-muted);">Consultant is reviewing your strategy...</p>';
        aiConfirmBtn.disabled = true;
        aiAnalysisStatus.textContent = 'Working...';
    }

    try {
        const token = localStorage.getItem('deriv_token');
        const response = await fetch(AI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ prompt, mode: 'analyze' })
        });

        const data = await handleAPIResponse(response);

        if (aiSummaryDisplay) {
            // Convert markdown-ish bold/bullets to HTML
            let summaryHtml = data.summary
                .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--primary-color)">$1</strong>')
                .replace(/^- (.*)$/gm, '<li style="margin-left:20px; margin-bottom:5px;">$1</li>');

            aiSummaryDisplay.innerHTML = `<div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">${summaryHtml}</div>`;
            aiConfirmBtn.disabled = false;
            aiAnalysisStatus.textContent = 'Completed';
            updateAIStatus('REVIEW');
            showToast('Analysis complete! Please review.', 'success');
        }

    } catch (error) {
        handleError(error);
    } finally {
        aiGenerateBtn.disabled = false;
        aiGenerateBtn.textContent = 'Analyze Strategy';
    }
}

async function handleGenerateCode() {
    const prompt = aiPromptInput.value.trim();

    console.log('🤖 AI: Generating code for prompt...');
    updateAIStatus('GENERATING');
    aiConfirmBtn.disabled = true;
    aiConfirmBtn.textContent = 'Generating Code...';

    try {
        const token = localStorage.getItem('deriv_token');
        const response = await fetch(AI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ prompt, mode: 'generate' })
        });

        const data = await handleAPIResponse(response);

        aiCodeEditor.value = data.code;
        console.log('✅ AI: Strategy code generated successfully');
        showToast('Code generated successfully!', 'success');
        updateAIStatus('READY');

        // Hide analysis after success
        resetConsultantUI();

        // Auto-compile
        if (window.aiStrategyRunner) {
            window.aiStrategyRunner.compile(data.code);
        }

    } catch (error) {
        handleError(error);
    } finally {
        aiConfirmBtn.disabled = false;
        aiConfirmBtn.textContent = 'Looks Good, Generate Code';
    }
}

async function handleAPIResponse(response) {
    const contentType = response.headers.get("content-type");
    let data;
    if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
    } else {
        const text = await response.text();
        throw new Error(`The server returned an invalid response. Ensure the Backend API is running.`);
    }

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Daily Quota Reached: You have exceeded the free-tier limit for today. Please try again tomorrow.');
        }
        throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
}

function handleError(error) {
    console.error('❌ AI Consultant Error:', error);
    showToast(error.message, 'error');
    updateAIStatus('ERROR');
    if (window.aiStrategyRunner) window.aiStrategyRunner.log(error.message, 'error');
}

function resetConsultantUI() {
    if (aiAnalysisContainer) aiAnalysisContainer.style.display = 'none';
    if (aiSummaryDisplay) aiSummaryDisplay.innerHTML = '';
}

// Deprecated original function
async function handleGenerateStrategy() {
    handleAnalyzeStrategy();
}

function handleRunStrategy() {
    const code = aiCodeEditor.value.trim();
    if (!code) {
        showToast('No code to run.', 'error');
        return;
    }

    if (!window.aiStrategyRunner) {
        showToast('AI Engine not initialized.', 'error');
        return;
    }

    // Get Selected Markets
    const selectedMarkets = getSelectedAIMarkets();
    if (selectedMarkets.length === 0) {
        showToast('Please select at least one market to trade.', 'error');
        return;
    }

    const compiled = window.aiStrategyRunner.compile(code);
    if (compiled) {
        // Reset Martingale State
        const stakeInput = document.getElementById('ai-stake-input');
        const baseStake = parseFloat(stakeInput?.value) || 0.35;
        window.aiTradingState.currentStake = baseStake;
        window.aiTradingState.consecutiveLosses = 0;
        window.aiTradingState.accumulatedLoss = 0; // Reset accumulation
        window.aiTradingState.totalProfit = 0;

        window.aiStrategyRunner.log(`Starting strategy on ${selectedMarkets.length} market(s). Base Stake: $${baseStake}`, 'info');

        // Start runner with selected markets
        const started = window.aiStrategyRunner.start(selectedMarkets);
        if (started) {
            updateAIStatus('RUNNING');
            updateAIButtons(true);
        }
    } else {
        showToast('Compilation Failed. Check logs.', 'error');
    }
}

function handleStopStrategy() {
    if (window.aiStrategyRunner) {
        window.aiStrategyRunner.stop();
        updateAIStatus('STOPPED');
        updateAIButtons(false);
    }
}

function updateAIStatus(status) {
    if (!aiStatusIndicator) return;

    // Status can be IDLE, GENERATING, READY, RUNNING, STOPPED, ERROR
    let text = status;
    let color = '#888';

    switch (status) {
        case 'IDLE': color = '#888'; break;
        case 'ANALYZING': color = '#f39c12'; break; // Orange
        case 'REVIEW': color = '#9b59b6'; break; // Purple
        case 'GENERATING': color = '#e67e22'; break; // Darker Orange
        case 'READY': color = '#3498db'; break; // Blue
        case 'RUNNING': color = '#2ecc71'; break; // Green
        case 'STOPPED': color = '#e74c3c'; break; // Red
        case 'ERROR': color = '#c0392b'; break; // Dark Red
    }

    aiStatusIndicator.textContent = text;
    aiStatusIndicator.style.color = color;
    aiStatusIndicator.style.borderColor = color;
}

function updateAIButtons(isRunning) {
    aiRunBtn.style.display = isRunning ? 'none' : 'inline-block';
    aiStopBtn.style.display = isRunning ? 'inline-block' : 'none';
}

// Global hooks for Engine
window.updateAILogs = function (logEntry) {
    if (!aiLogContainer) return;

    const div = document.createElement('div');
    div.className = `log-entry log-${logEntry.type}`;
    div.textContent = `[${logEntry.time}] ${logEntry.message}`;

    aiLogContainer.insertBefore(div, aiLogContainer.firstChild);

    // Keep max 50 logs in UI
    if (aiLogContainer.children.length > 50) {
        aiLogContainer.removeChild(aiLogContainer.lastChild);
    }
};

// Global hook for Trade Execution
// NOTE: window.executeAIStratTrade is now defined in trading.js for proper separation of concerns


// --- MARTINGALE STATE MANAGEMENT ---
window.aiTradingState = {
    currentStake: 0.35,
    consecutiveLosses: 0,
    totalProfit: 0,
    startTime: null,
    timerInterval: null,
    winCount: 0,
    lossCount: 0,
    totalStake: 0,
    totalPayout: 0,
    runsCount: 0,
    accumulatedLoss: 0 // Track accumulated losses for Smart Recovery
};

// UI Updater for AI Stats
function updateAIStatsUI() {
    // Total P/L
    const profitEl = document.getElementById('aiProfitLossDisplay');
    if (profitEl) {
        profitEl.textContent = `$${window.aiTradingState.totalProfit.toFixed(2)}`;
        profitEl.className = `profit-value ${window.aiTradingState.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`;
    }

    // Win Rate
    const winRateEl = document.getElementById('aiWinRateDisplay');
    if (winRateEl) {
        const totalTrades = window.aiTradingState.winCount + window.aiTradingState.lossCount;
        const winRate = totalTrades > 0 ? ((window.aiTradingState.winCount / totalTrades) * 100).toFixed(1) : '0.0';
        winRateEl.textContent = `${winRate}%`;
    }

    // Trades
    const tradesEl = document.getElementById('aiTradesCountDisplay');
    if (tradesEl) {
        tradesEl.textContent = `${window.aiTradingState.winCount}W/${window.aiTradingState.lossCount}L`;
    }

    // Total Stake
    const stakeEl = document.getElementById('aiTotalStakeDisplay');
    if (stakeEl) {
        stakeEl.textContent = `$${window.aiTradingState.totalStake.toFixed(2)}`;
    }

    // Total Payout
    const payoutEl = document.getElementById('aiTotalPayoutDisplay');
    if (payoutEl) {
        payoutEl.textContent = `$${window.aiTradingState.totalPayout.toFixed(2)}`;
    }

    // Runs Count
    const runsEl = document.getElementById('aiRunsCountDisplay');
    if (runsEl) {
        runsEl.textContent = window.aiTradingState.runsCount;
    }
}

// Timer Logic
function startAITimer() {
    stopAITimer();
    window.aiTradingState.startTime = Date.now();
    window.aiTradingState.timerInterval = setInterval(updateAITimer, 1000);
    updateAITimer();
}

function stopAITimer() {
    if (window.aiTradingState.timerInterval) {
        clearInterval(window.aiTradingState.timerInterval);
        window.aiTradingState.timerInterval = null;
    }
}

function updateAITimer() {
    const timerEl = document.getElementById('aiTimerDisplay');
    if (!timerEl || !window.aiTradingState.startTime) return;

    const diff = Math.floor((Date.now() - window.aiTradingState.startTime) / 1000);
    const hrs = Math.floor(diff / 3600).toString().padStart(2, '0');
    const mins = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    timerEl.textContent = `${hrs}:${mins}:${secs}`;
}

// Called by app.js when a contract finishes
window.handleAIStrategyResult = function (contract) {
    const profit = parseFloat(contract.profit);
    const stakeInput = document.getElementById('ai-stake-input');
    const martingaleInput = document.getElementById('ai-martingale-input');

    // Update Stats
    window.aiTradingState.totalProfit += profit;
    const tradeStake = parseFloat(contract.buy_price) || window.aiTradingState.currentStake; // Best effort stake tracking
    window.aiTradingState.totalStake += tradeStake;

    // Potential Payout Auto-Detection
    const payoutAutoCheckbox = document.getElementById('ai-payout-auto');
    const payoutPercentInput = document.getElementById('ai-payout-input');

    if (payoutAutoCheckbox && payoutAutoCheckbox.checked && payoutPercentInput) {
        // Calculate payout percentage: (payout / buy_price * 100) - 100
        // contract.payout is the total return (stake + profit)
        const totalPayout = parseFloat(contract.payout);
        const buyPrice = parseFloat(contract.buy_price);

        if (totalPayout && buyPrice) {
            const detectedPayoutPct = Math.round(((totalPayout / buyPrice) * 100) - 100);
            if (!isNaN(detectedPayoutPct) && detectedPayoutPct > 0) {
                payoutPercentInput.value = detectedPayoutPct;
                if (window.aiStrategyRunner) {
                    window.aiStrategyRunner.log(`Auto-detected Payout: ${detectedPayoutPct}%`, 'info');
                }
            }
        }
    }

    if (profit > 0) {
        // WIN
        window.aiTradingState.winCount++;
        const payout = tradeStake + profit; // Approx payout
        window.aiTradingState.totalPayout += payout;

        // Reset stake and accumulation
        const baseStake = parseFloat(stakeInput?.value) || 0.35;
        window.aiTradingState.currentStake = baseStake;
        window.aiTradingState.consecutiveLosses = 0;
        window.aiTradingState.accumulatedLoss = 0;

        if (window.aiStrategyRunner) {
            window.aiStrategyRunner.log(`WIN: +$${profit.toFixed(2)}. Stake reset to $${baseStake}`, 'success');
        }
    } else {
        // LOSS
        window.aiTradingState.lossCount++;
        // Payout is 0 on loss

        // Smart Recovery or Martingale
        window.aiTradingState.consecutiveLosses++;

        // Add current loss to accumulation
        window.aiTradingState.accumulatedLoss += window.aiTradingState.currentStake;

        const isSmartRecovery = document.getElementById('ai-smart-recovery-toggle')?.checked;
        let nextStake;
        let logMsg = '';

        if (isSmartRecovery) {
            const payoutPercentInput = document.getElementById('ai-payout-input');
            const payoutPercent = parseFloat(payoutPercentInput?.value) || 70;

            // Formula: accumulatedLoss * (100 / payoutPercent)
            const recoveryMultiplier = 100 / payoutPercent;
            nextStake = window.aiTradingState.accumulatedLoss * recoveryMultiplier;

            // Safety: Ensure new stake is at least base stake (though arguably it should be calculated)
            // But main logic is recovery. 

            logMsg = `Smart Recovery: AccLoss $${window.aiTradingState.accumulatedLoss.toFixed(2)} * (100/${payoutPercent}%)`;
        } else {
            // Legacy Martingale
            const martingaleMultiplier = parseFloat(martingaleInput?.value) || 2.1;
            nextStake = window.aiTradingState.currentStake * martingaleMultiplier;
            logMsg = `Martingale: x${martingaleMultiplier}`;
        }

        nextStake = Math.round(nextStake * 100) / 100;
        window.aiTradingState.currentStake = nextStake;

        if (window.aiStrategyRunner) {
            window.aiStrategyRunner.log(`LOSS: $${profit.toFixed(2)}. ${logMsg} -> Next Stake: $${nextStake}`, 'warning');
        }
    }

    // Update UI
    updateAIStatsUI();
    updateAIHistoryTable(contract, profit);
};

// Reset state when strategy starts
// Re-hooking existing handleRunStrategy to add stats initialization
const originalHandleRun = handleRunStrategy;
handleRunStrategy = function () {
    // Reset Session Stats (keep runsCount accumulating, or increment it)
    const stakeInput = document.getElementById('ai-stake-input');
    const baseStake = parseFloat(stakeInput?.value) || 0.35;

    window.aiTradingState.currentStake = baseStake;
    window.aiTradingState.consecutiveLosses = 0;
    window.aiTradingState.accumulatedLoss = 0;
    window.aiTradingState.totalProfit = 0;
    window.aiTradingState.winCount = 0;
    window.aiTradingState.lossCount = 0;
    window.aiTradingState.totalStake = 0;
    window.aiTradingState.totalPayout = 0;

    window.aiTradingState.runsCount++;

    if (window.aiStrategyRunner) window.aiStrategyRunner.log(`Starting with Base Stake: $${baseStake}`, 'info');

    // Start Timer
    startAITimer();
    updateAIStatsUI();

    originalHandleRun();
};

// Hook into stop button to stop timer
const stopBtn = document.getElementById('ai-stop-btn');
if (stopBtn) {
    const originalStopClick = stopBtn.onclick;
    stopBtn.onclick = function (e) {
        stopAITimer();
        if (typeof originalStopClick === 'function') originalStopClick(e);
        // Call the original handler defined in ai_ui.js (which might be anonymous or attached via event listener, so we rely on the DOM event propagation or re-attach if we knew the name)
        // Since handleStopStrategy is attached via event listener in ai_ui.js init, we can just stop the timer here.
        handleStopStrategy();
    };
}
// Helper: Update AI History Table
function updateAIHistoryTable(contract, profit) {
    const tableBody = document.querySelector('#ai-history-table tbody');
    if (!tableBody) return;

    const row = document.createElement('tr');

    // Virtual Trade Styling
    const isVirtual = contract.isVirtual;
    if (isVirtual) {
        row.style.background = 'rgba(255, 255, 255, 0.05)'; // Dimmed background for virtual
        row.style.fontStyle = 'italic';
    }

    // Time
    const timeCell = document.createElement('td');
    const date = new Date();
    timeCell.textContent = date.toLocaleTimeString();
    timeCell.style.padding = '8px';
    timeCell.style.borderBottom = '1px solid var(--glass-border)';

    // Symbol
    const symbolCell = document.createElement('td');
    const symbolText = contract.symbol + (isVirtual ? ' (Virtual)' : '');
    symbolCell.innerHTML = symbolText; // Allow HTML if needed? No, textContent is fine.
    // Use innerHTML to style the (Virtual) tag if we wanted, but text is safer. 
    // Let's use simple text but distinct color for virtual tag if we want.
    if (isVirtual) {
        symbolCell.innerHTML = `${contract.symbol} <span style="font-size:0.8em; opacity:0.7">(Virtual)</span>`;
    } else {
        symbolCell.textContent = contract.symbol;
    }

    symbolCell.style.padding = '8px';
    symbolCell.style.borderBottom = '1px solid var(--glass-border)';

    // Result
    const resultCell = document.createElement('td');
    const isWin = profit > 0;

    let resultText = isWin ? 'WIN' : 'LOSS';
    if (isVirtual) resultText = isWin ? 'V-WIN' : 'V-LOSS';

    resultCell.textContent = resultText;
    resultCell.style.padding = '8px';
    resultCell.style.textAlign = 'center';
    resultCell.style.color = isWin ? '#2ecc71' : '#e74c3c';
    resultCell.style.fontWeight = 'bold';
    resultCell.style.borderBottom = '1px solid var(--glass-border)';

    // Profit
    const profitCell = document.createElement('td');

    // For virtual trades, profit is just +1 or -1 usually, or simulated status
    if (isVirtual) {
        profitCell.textContent = '---';
        profitCell.style.opacity = '0.5';
    } else {
        profitCell.textContent = (profit > 0 ? '+' : '') + profit.toFixed(2);
    }

    profitCell.style.padding = '8px';
    profitCell.style.textAlign = 'right';
    profitCell.style.color = isWin ? '#2ecc71' : '#e74c3c';
    profitCell.style.borderBottom = '1px solid var(--glass-border)';

    row.appendChild(timeCell);
    row.appendChild(symbolCell);
    row.appendChild(resultCell);
    row.appendChild(profitCell);

    // Prepend to show newest first
    tableBody.insertBefore(row, tableBody.firstChild);

    // Keep max 50 rows
    if (tableBody.children.length > 50) {
        tableBody.removeChild(tableBody.lastChild);
    }
}

// ==========================================
// STRATEGY MANAGEMENT FUNCTIONS
// ==========================================

async function loadSavedStrategies() {
    if (!aiStrategiesList) return;

    try {
        const response = await fetch(AI_STRATEGY_API);
        if (!response.ok) throw new Error('Failed to load strategies');

        const strategies = await response.json();

        // Clear list
        aiStrategiesList.innerHTML = '';

        if (strategies.length === 0) {
            aiStrategiesList.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.8rem; font-style: italic;">
                    No strategies saved yet. Create one!
                </div>`;
            return;
        }

        strategies.forEach(strategy => {
            const el = document.createElement('div');
            el.className = 'ai-strategy-item';
            el.innerHTML = `
                <div class="strategy-info">
                    <span class="strategy-name">${strategy.name}</span>
                    <span class="strategy-date">${new Date(strategy.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="strategy-actions">
                    <button class="btn-micro load-btn" data-id="${strategy.id}" title="Load Strategy">📂 Load</button>
                    <button class="btn-micro delete-btn" data-id="${strategy.id}" title="Delete Strategy" style="color: #ff444f; border-color: rgba(255, 68, 79, 0.3);">❌</button>
                </div>
            `;

            // Bind events
            el.querySelector('.load-btn').addEventListener('click', () => handleLoadStrategy(strategy.id));
            el.querySelector('.delete-btn').addEventListener('click', () => handleDeleteStrategy(strategy.id));

            aiStrategiesList.appendChild(el);
        });

        console.log(`✅ Loaded ${strategies.length} saved strategies`);

    } catch (error) {
        console.error('Error loading strategies:', error);
        aiStrategiesList.innerHTML = `<div style="text-align: center; color: #e74c3c; padding: 10px;">Failed to load strategies</div>`;
    }
}

async function handleSaveStrategy() {
    const code = aiCodeEditor.value.trim();
    if (!code) {
        showToast('No code to save', 'error');
        return;
    }

    const name = prompt('Enter a name for this strategy:');
    if (!name) return; // User cancelled

    const promptText = aiPromptInput.value.trim();

    try {
        const response = await fetch(AI_STRATEGY_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                code,
                prompt: promptText
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save');
        }

        showToast('Strategy saved successfully!', 'success');
        loadSavedStrategies(); // Refresh list

    } catch (error) {
        console.error('Error saving strategy:', error);
        showToast(error.message, 'error');
    }
}

async function handleLoadStrategy(id) {
    if (!id) return;

    try {
        const response = await fetch(`${AI_STRATEGY_API}/${id}`);
        if (!response.ok) throw new Error('Failed to load strategy details');

        const strategy = await response.json();

        aiCodeEditor.value = strategy.code;
        if (strategy.prompt && aiPromptInput) {
            aiPromptInput.value = strategy.prompt;
            // update counter
            if (aiPromptCounter) aiPromptCounter.textContent = `${strategy.prompt.length} / 2000`;
        }

        showToast(`Loaded "${strategy.name}"`, 'success');

    } catch (error) {
        console.error('Error loading strategy:', error);
        showToast('Failed to load strategy', 'error');
    }
}

async function handleDeleteStrategy(id) {
    if (!id) return;

    if (!confirm('Are you sure you want to delete this strategy?')) return;

    try {
        const response = await fetch(`${AI_STRATEGY_API}/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete');

        showToast('Strategy deleted', 'success');
        loadSavedStrategies(); // Refresh list

    } catch (error) {
        console.error('Error deleting strategy:', error);
        showToast('Failed to delete strategy', 'error');
    }
}

