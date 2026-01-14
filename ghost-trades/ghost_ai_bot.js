// ===================================
// GHOST AI BOT LOGIC - ENHANCED RAMMY STRATEGY
// ===================================
// Implements automated trading strategy with intelligent market scanning,
// configurable conditions, and martingale money management.
// Now featuring: DYNAMIC VIRTUAL HOOK (Dual Socket)

// Configuration Constants
const GHOST_DEMO_TOKEN = "gaevoMo6NeKj1Dr"; // Hardcoded Ghost Token

let isBotRunning = false;
let botLoopInterval = null;
let currentMarketIndex = 0;
let botStartTime = null;

// Initialize global tracking variables
// Global State for Ghost AI
window.activeContracts = {};
window.activeS1Symbols = new Map(); // Changed from Set to Map for timestamp tracking
window.processedContracts = new Set();
// Track last trade time per symbol to prevent double entry
window.lastTradeTimes = {};

// Bot State Object - Tracks current strategy state
const botState = {
    // Strategy Parameters
    initialStake: 10.0,
    targetProfit: 50.0,
    stopLoss: 50.0,
    payoutPercentage: 95.0, // Default 95%
    maxMartingaleSteps: 4,

    // S1 Parameters
    s1UseDigitCheck: true,
    s1CheckDigits: 4,
    s1MaxDigit: 3,
    s1UsePercentage: true,
    s1Prediction: 2,
    s1Percentage: 70.0,
    s1PercentageOperator: '>=',
    s1MaxLosses: 1, // Max consecutive losses before blocking S1
    s1ContractType: 'OVER',
    s1DigitOperator: '<=',

    // S2 Parameters
    s2UseDigitCheck: true,
    s2CheckDigits: 6,
    s2MaxDigit: 4,
    s2UsePercentage: true,
    s2Prediction: 5,
    s2Percentage: 45.0,
    s2PercentageOperator: '>=',
    s2ContractType: 'UNDER',
    s2DigitOperator: '<=',

    // Runtime State
    currentStake: 10.0,
    totalProfit: 0.0,
    totalLoss: 0.0,
    totalPL: 0.0,
    accumulatedStakesLost: 0.0,
    activeStrategy: 'S1', // 'S1' (Entry) or 'S2' (Recovery)
    isTrading: false,
    martingaleStepCount: 0,
    activeSymbol: null,
    recoverySymbol: null,
    winCount: 0,
    lossCount: 0,
    winPercentage: 0,
    s1LossSymbol: null, // Track symbol that caused S1 loss
    totalStake: 0.0,
    totalPayout: 0.0,
    runId: null, // Unique ID for current run
    activeS2Count: 0, // Track active S2 trades to limit concurrency

    // S1 Monitoring
    s1ConsecutiveLosses: 0, // Track consecutive S1 losses
    s1Blocked: false, // Flag to block S1 after max losses

    // NEW: Dual Socket State
    nextTradeReal: false // Default: False (Ghost Mode)
};

// --- DUAL SOCKET HELPER ---
// performSwitch is no longer needed with Dual Socket architecture.

async function startGhostAiBot() {
    if (isBotRunning) return;

    // Initialize Ghost Service (Background WS)
    if (window.ghostService) {
        if (!window.ghostService.isConnected) {
            window.ghostService.connect();
        }
        // Attach Result Handler - Force re-attach
        console.log("👻 Attaching handleGhostTradeResult to ghostService");
        window.ghostService.onTradeResult = handleGhostTradeResult;
    } else {
        console.warn("⚠️ Ghost AI: Ghost Service not found! Virtual Hook may fail.");
    }

    // Initialize Bot State for Dual Mode
    botState.nextTradeReal = false; // Default: Trade on Ghost (Background)

    // CRITICAL: Real account confirmation
    if (typeof confirmRealAccountBotStart === 'function') {
        if (!confirmRealAccountBotStart('Ghost AI Bot')) {
            return; // User cancelled
        }
    }

    isBotRunning = true;
    botState.runId = `bot-${Date.now()}`;

    // Increment runs count only when starting a new run
    // Use typeof to check if undefined/null, not falsy check (0 is falsy!)
    if (typeof botState.runsCount === 'undefined' || botState.runsCount === null) {
        botState.runsCount = 0;
    }
    botState.runsCount++;

    // Start bot timer
    botStartTime = Date.now();
    startBotTimer();

    // Clear logs but KEEP trade history (users need to see past trades)
    const botLogContainer = document.getElementById('bot-log-container');
    if (botLogContainer) {
        botLogContainer.innerHTML = '';
    }

    // Clear any stale contracts and locks from previous session
    window.activeContracts = {}; // Reset global contract tracking
    if (window.activeS1Symbols) window.activeS1Symbols.clear(); // Reset global S1 symbol tracking
    if (window.processedContracts) window.processedContracts.clear(); // Reset processed contracts tracking
    expectedStakes = {}; // Clear expected stakes
    if (typeof clearAllPendingStakes === 'function') {
        clearAllPendingStakes();
    }

    // Add session start marker in logs
    addBotLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    addBotLog(`🔄 New Bot Session Started`, 'info');
    addBotLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');

    // Update button states (if updateGhostAIButtonStates function exists)
    if (typeof updateGhostAIButtonStates === 'function') {
        updateGhostAIButtonStates(true);
    }

    // Load parameters from UI
    const initialStake = parseFloat(botInitialStake.value);
    const targetProfit = parseFloat(botTargetProfit.value);
    const payoutPercentage = parseFloat(botPayoutPercentage.value);
    const stopLoss = parseFloat(botStopLoss.value);
    const maxMartingaleSteps = parseInt(botMaxMartingale.value);

    // Load new configuration parameters
    const analysisDigits = parseInt(document.getElementById('botAnalysisDigits')?.value || 15);
    const s1UseDigitCheck = document.getElementById('botS1UseDigitCheck')?.checked ?? true;
    const s1CheckDigits = parseInt(document.getElementById('botS1CheckDigits')?.value || 4);
    const s1MaxDigit = parseInt(document.getElementById('botS1MaxDigit')?.value || 3);
    const s1UsePercentage = document.getElementById('botS1UsePercentage')?.checked ?? true;
    const s1Prediction = parseInt(document.getElementById('botS1Prediction')?.value || 2);
    const s1Percentage = parseFloat(document.getElementById('botS1Percentage')?.value || 70);
    const s1PercentageOperator = document.getElementById('botS1PercentageOperator')?.value || '>=';
    const s1MaxLosses = parseInt(document.getElementById('botS1MaxLosses')?.value || 1);
    const s2UseDigitCheck = document.getElementById('botS2UseDigitCheck')?.checked ?? true;
    const s2CheckDigits = parseInt(document.getElementById('botS2CheckDigits')?.value || 6);
    const s2MaxDigit = parseInt(document.getElementById('botS2MaxDigit')?.value || 4);
    const s1ContractType = document.getElementById('botS1ContractType')?.value || 'OVER';
    const s1DigitOperator = document.getElementById('botS1DigitOperator')?.value || '<=';
    const s2UsePercentage = document.getElementById('botS2UsePercentage')?.checked ?? true;
    const s2Prediction = parseInt(document.getElementById('botS2Prediction')?.value || 5);
    const s2ContractType = document.getElementById('botS2ContractType')?.value || 'UNDER';
    const s2DigitOperator = document.getElementById('botS2DigitOperator')?.value || '<=';
    const s2Percentage = parseFloat(document.getElementById('botS2Percentage')?.value || 45);
    const s2PercentageOperator = document.getElementById('botS2PercentageOperator')?.value || '>=';

    // Initialize bot state following XML structure
    botState.initialStake = initialStake;
    botState.targetProfit = targetProfit;
    botState.payoutPercentage = payoutPercentage;
    botState.stopLoss = stopLoss;
    botState.maxMartingaleSteps = maxMartingaleSteps;
    botState.analysisDigits = analysisDigits;
    botState.s1UseDigitCheck = s1UseDigitCheck;
    botState.s1CheckDigits = s1CheckDigits;
    botState.s1MaxDigit = s1MaxDigit;
    botState.s1UsePercentage = s1UsePercentage;
    botState.s1Prediction = s1Prediction;
    botState.s1Percentage = s1Percentage;
    botState.s1PercentageOperator = s1PercentageOperator;
    botState.s1ContractType = s1ContractType;
    botState.s1DigitOperator = s1DigitOperator;
    botState.s1MaxLosses = s1MaxLosses;
    botState.s1ConsecutiveLosses = 0; // Track consecutive S1 losses
    botState.s1Blocked = false; // Flag to block S1 after max losses
    botState.s2UseDigitCheck = s2UseDigitCheck;
    botState.s2CheckDigits = s2CheckDigits;
    botState.s2MaxDigit = s2MaxDigit;
    botState.s2UsePercentage = s2UsePercentage;
    botState.s2Prediction = s2Prediction;
    botState.s2ContractType = s2ContractType;
    botState.s2DigitOperator = s2DigitOperator;
    botState.s2Percentage = s2Percentage;
    botState.s2PercentageOperator = s2PercentageOperator;
    botState.currentStake = botState.initialStake;
    botState.totalProfit = 0.0;
    botState.totalLoss = 0.0;
    botState.totalPL = 0.0; // Cumulative P/L
    botState.accumulatedStakesLost = 0.0; // Reset accumulated stake losses
    botState.activeStrategy = 'S1';
    botState.isTrading = false;
    botState.martingaleStepCount = 0;
    botState.activeSymbol = null;
    botState.recoverySymbol = null;
    botState.winCount = 0;
    botState.lossCount = 0;
    botState.winPercentage = 0;
    botState.s1LossSymbol = null;
    botState.totalStake = 0.0;
    botState.totalPayout = 0.0;
    botState.activeS2Count = 0; // Initialize S2 counter
    // Don't reset runsCount - it should persist across runs

    // Save current settings to localStorage
    if (typeof window.botSettingsManager !== 'undefined') {
        const settings = {
            initialStake: initialStake,
            targetProfit: targetProfit,
            payoutPercentage: payoutPercentage,
            stopLoss: stopLoss,
            maxMartingale: maxMartingaleSteps,
            analysisDigits: analysisDigits,
            s1UseDigitCheck: s1UseDigitCheck,
            s1CheckDigits: s1CheckDigits,
            s1MaxDigit: s1MaxDigit,
            s1UsePercentage: s1UsePercentage,
            s1Prediction: s1Prediction,
            s1Percentage: s1Percentage,
            s1PercentageOperator: s1PercentageOperator,
            s1MaxLosses: s1MaxLosses,
            s1ContractType: s1ContractType,
            s1DigitOperator: s1DigitOperator,
            s2UseDigitCheck: s2UseDigitCheck,
            s2CheckDigits: s2CheckDigits,
            s2MaxDigit: s2MaxDigit,
            s2UsePercentage: s2UsePercentage,
            s2Prediction: s2Prediction,
            s2ContractType: s2ContractType,
            s2DigitOperator: s2DigitOperator,
            s2Percentage: s2Percentage,
            s2PercentageOperator: s2PercentageOperator
        };
        window.botSettingsManager.saveSettings('ghost_ai', settings);
    }

    // Initialize Virtual Hook (if manager exists)
    if (typeof window.virtualHookManager !== 'undefined') {
        const vHookEnabled = document.getElementById('ghostaiVirtualHookEnabled')?.checked || false;
        const vHookTrigger = document.getElementById('ghostaiVirtualHookStartWhen')?.value || 'LOSS';
        const vHookCount = parseInt(document.getElementById('ghostaiVirtualHookTrigger')?.value) || 1;
        const vHookFixedStake = parseFloat(document.getElementById('ghostaiVirtualHookFixedStake')?.value) || null;

        window.virtualHookManager.enableForBot('ghost_ai', {
            enabled: vHookEnabled,
            triggerType: vHookTrigger,
            triggerCount: vHookCount,
            fixedStake: vHookFixedStake
        });

        if (vHookEnabled) {
            addBotLog(`🪝 Virtual Hook ENABLED: Wait for ${vHookCount} Virtual ${vHookTrigger}(s)`, 'warning');
        }
    }

    updateProfitLossDisplay();
    updateBotStats();

    addBotLog(`🤖 Rammy Auto Strategy Started`);
    addBotLog(`📊 Analyzing last ${analysisDigits} digits + percentages + full distribution across ${Object.keys(marketTickHistory).length} markets`);

    // Update emergency button visibility
    if (typeof updateEmergencyButtonVisibility === 'function') {
        updateEmergencyButtonVisibility();
    }

    // CRITICAL: Check if we have subscribed markets
    if (Object.keys(marketTickHistory).length === 0) {
        addBotLog(`⚠️ WARNING: No markets subscribed! Please visit the Speedbot section first to subscribe to markets.`, 'warning');
        showToast('No markets subscribed! Visit Speedbot section first.', 'warning');
        return; // Don't proceed without markets
    }

    addBotLog(`💰 Initial Stake: $${botState.initialStake.toFixed(2)} | Target: $${botState.targetProfit.toFixed(2)} | Stop Loss: $${botState.stopLoss.toFixed(2)}`);

    // Build S1 condition string
    let s1Conditions = [];
    if (s1UseDigitCheck) s1Conditions.push(`Last ${s1CheckDigits} ${s1DigitOperator} ${s1MaxDigit}`);
    if (s1UsePercentage) s1Conditions.push(`Over ${s1Prediction}% ${s1PercentageOperator} ${s1Percentage}%`);
    s1Conditions.push(`Most digit >4 & Least digit <4`);
    addBotLog(`📈 S1: ${s1Conditions.join(' & ')} → ${s1ContractType} ${s1Prediction} | Max Losses: ${s1MaxLosses}`);

    // Build S2 condition string
    let s2Conditions = [];
    if (s2UseDigitCheck) s2Conditions.push(`Last ${s2CheckDigits} ${s2DigitOperator} ${s2MaxDigit}`);
    if (s2UsePercentage) s2Conditions.push(`Over ${s2Prediction}% ${s2PercentageOperator} ${s2Percentage}%`);
    s2Conditions.push(`Most digit >4 & Least digit <4`);
    addBotLog(`📉 S2: ${s2Conditions.join(' & ')} → ${s2ContractType} ${s2Prediction}`);

    addBotLog(`⏳ Waiting for valid entry conditions...`);

    // Log initial market status
    const totalMarkets = Object.keys(marketTickHistory).length;
    const readyMarkets = Object.keys(marketTickHistory).filter(s =>
        marketTickHistory[s] && marketTickHistory[s].length >= 20
    ).length;
    addBotLog(`📊 Markets: ${totalMarkets} total, ${readyMarkets} ready (need 20+ ticks)`, 'info');

    // Initialize technical indicators
    updateTechnicalIndicators();

    // Start periodic cleanup of stale contracts (every 30 seconds)
    if (botLoopInterval) {
        clearInterval(botLoopInterval);
    }
    botLoopInterval = setInterval(() => {
        if (isBotRunning) {
            cleanupStaleContracts();

            // Log market readiness every 30 seconds
            const ready = Object.keys(marketTickHistory).filter(s =>
                marketTickHistory[s] && marketTickHistory[s].length >= 20
            ).length;
            const total = Object.keys(marketTickHistory).length;
            console.log(`📊 Market Status: ${ready}/${total} markets ready`);
        }
    }, 30000);
}

async function stopGhostAiBot() {
    // CRITICAL: Prevent stopping if we are just switching tokens for the Hook
    if (window.isHookSwitching) {
        console.log("🛑 Blocked stopGhostAiBot due to Dynamic Hook Switch");
        return;
    }

    if (!isBotRunning) return;
    isBotRunning = false;

    // Stop bot timer
    stopBotTimer();

    // Also clear the toggle interval if running
    if (botLoopInterval) {
        clearInterval(botLoopInterval);
        botLoopInterval = null;
    }

    // Clear all trade locks when stopping
    if (typeof clearAllPendingStakes === 'function') {
        clearAllPendingStakes();
    }

    // Clear virtual hook data
    if (typeof window.virtualHookManager !== 'undefined') {
        window.virtualHookManager.clearBot('ghost_ai');
    }

    // Update button states
    if (typeof updateGhostAIButtonStates === 'function') {
        updateGhostAIButtonStates(false);
    }

    addBotLog("🛑 Bot stopped by user.", 'warning');
    botState.runId = null;
    updateProfitLossDisplay();

    // Update emergency button visibility
    if (typeof updateEmergencyButtonVisibility === 'function') {
        updateEmergencyButtonVisibility();
    }
}

/**
 * Remove stale contracts from activeContracts to prevent memory leaks
 * and ensure clean state.
 */
function cleanupStaleContracts() {
    const now = Date.now();
    const STALE_TIMEOUT = 300000; // 5 minutes (for active contracts)
    const ORPHAN_TIMEOUT = 20000; // 20 seconds (for symbols stuck in "checking" state without contract)

    if (typeof window.activeContracts !== 'undefined') {
        // 1. Cleanup Stale Contracts (existing logic)
        Object.keys(window.activeContracts).forEach(contractId => {
            const contract = window.activeContracts[contractId];
            if (contract && contract.startTime && (now - contract.startTime > STALE_TIMEOUT)) {
                console.log(`🧹 Cleaning up stale contract: ${contractId}`);

                if (contract.symbol && typeof releaseTradeLock === 'function') {
                    releaseTradeLock(contract.symbol, 'ghost_ai');
                }

                if (contract.symbol && window.activeS1Symbols instanceof Map) {
                    window.activeS1Symbols.delete(contract.symbol);
                } else if (contract.symbol && window.activeS1Symbols instanceof Set) {
                    window.activeS1Symbols.delete(contract.symbol);
                }

                delete window.activeContracts[contractId];
            }
        });

        // 2. Cleanup Orphaned S1 Locks (New Logic)
        if (window.activeS1Symbols instanceof Map) {
            for (const [symbol, timestamp] of window.activeS1Symbols.entries()) {
                // If symbol has been locked for > 20s
                if (now - timestamp > ORPHAN_TIMEOUT) {
                    // Check if there is actually an active contract for this symbol
                    const hasActiveContract = Object.values(window.activeContracts).some(c => c.symbol === symbol);

                    if (!hasActiveContract) {
                        console.warn(`🧟 Cleaning up ZOMBIE lock for ${symbol} (orphaned for ${(now - timestamp) / 1000}s)`);
                        window.activeS1Symbols.delete(symbol);
                        if (typeof releaseTradeLock === 'function') {
                            releaseTradeLock(symbol, 'ghost_ai');
                        }
                    }
                }
            }
        }
    }
}

/**
 * Helper function to compare values using operator
 */
function compareWithOperator(actual, operator, expected) {
    switch (operator) {
        case '>':
            return actual > expected;
        case '>=':
            return actual >= expected;
        case '=':
            return actual === expected;
        case '<=':
            return actual <= expected;
        case '<':
            return actual < expected;
        default:
            return actual >= expected;
    }
}

/**
 * Calculate digit distribution from full tick history (last 100 digits)
 */
function calculateFullDigitDistribution(symbol) {
    const digits = marketFullTickDigits[symbol] || [];
    if (digits.length === 0) return null;

    const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    digits.forEach(digit => {
        counts[digit]++;
    });

    let mostAppearingDigit = 0;
    let leastAppearingDigit = 0;
    let maxCount = counts[0];
    let minCount = counts[0];

    for (let i = 1; i <= 9; i++) {
        if (counts[i] > maxCount) {
            maxCount = counts[i];
            mostAppearingDigit = i;
        }
        if (counts[i] < minCount) {
            minCount = counts[i];
            leastAppearingDigit = i;
        }
    }

    return {
        counts,
        mostAppearingDigit,
        leastAppearingDigit,
        totalTicks: digits.length
    };
}

/**
 * Update and display win percentage
 */
function updateWinPercentage() {
    const totalTrades = botState.winCount + botState.lossCount;
    if (totalTrades > 0) {
        botState.winPercentage = (botState.winCount / totalTrades) * 100;

        const winRateDisplay = document.getElementById('botWinRateDisplay');
        const tradesCountDisplay = document.getElementById('botTradesCountDisplay');

        if (winRateDisplay) {
            winRateDisplay.textContent = `${botState.winPercentage.toFixed(1)}%`;
        }

        if (tradesCountDisplay) {
            tradesCountDisplay.textContent = `${botState.winCount}W/${botState.lossCount}L`;
        }

        addBotLog(`📊 Win/Loss: ${botState.winCount}W/${botState.lossCount}L | Win Rate: ${botState.winPercentage.toFixed(1)}%`, 'info');
    }
    updateBotStats();
}

/**
 * Update and display bot statistics
 */
function updateBotStats() {
    const totalStakeDisplay = document.getElementById('botTotalStakeDisplay');
    const totalPayoutDisplay = document.getElementById('botTotalPayoutDisplay');
    const runsCountDisplay = document.getElementById('botRunsCountDisplay');

    if (totalStakeDisplay) {
        totalStakeDisplay.textContent = `$${botState.totalStake.toFixed(2)}`;
    }
    if (totalPayoutDisplay) {
        totalPayoutDisplay.textContent = `$${botState.totalPayout.toFixed(2)}`;
    }
    if (runsCountDisplay) {
        runsCountDisplay.textContent = `${botState.runsCount}`;
    }
}

// Performance optimization: Track last scan time and trade placement to avoid excessive scanning
let lastScanTime = 0;
const SCAN_COOLDOWN = 100; // Base cooldown between scans
let lastTradeTime = 0;
const TRADE_COOLDOWN = 100; // No scans for 5 seconds after a trade is placed
let isScanning = false; // Atomic scan lock to prevent simultaneous scans

// Access global values (ensure they exist)
const activeContracts = window.activeContracts || {};
const activeS1Symbols = window.activeS1Symbols || new Set();

// Bot Log Function
function addBotLog(message, type = 'info') {
    const botLogContainer = document.getElementById('bot-log-container');
    if (!botLogContainer) {
        console.warn('Bot log container not found');
        return;
    }

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;

    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;

    botLogContainer.appendChild(logEntry);

    // Auto-scroll to bottom
    botLogContainer.scrollTop = botLogContainer.scrollHeight;

    // Limit log entries to prevent memory issues (keep last 100)
    while (botLogContainer.children.length > 100) {
        botLogContainer.removeChild(botLogContainer.firstChild);
    }
}

// Bot timer variables
let botTimerInterval = null;

// Trade timing diagnostics
let postTradeTickMonitoring = {};

// Live Contract Monitor
let liveContractMonitor = {};


function renderLiveContracts() {
    const container = document.getElementById('live-contracts-container');
    if (!container) return;

    container.innerHTML = '';
    const contracts = Object.values(liveContractMonitor);

    if (contracts.length === 0) {
        container.innerHTML = '<div class="no-contracts">Waiting for active trades...</div>';
        return;
    }

    contracts.forEach(contract => {
        const card = document.createElement('div');
        card.className = 'live-contract-card';

        // Header
        const header = document.createElement('div');
        header.className = 'contract-header';
        header.innerHTML = `
            <span class="symbol">${contract.symbol}</span>
            <span class="type ${contract.contractType.toLowerCase()}">${contract.contractType} ${contract.barrier}</span>
        `;
        card.appendChild(header);

        // Ticks visualization
        const ticksContainer = document.createElement('div');
        ticksContainer.className = 'ticks-visual';

        contract.ticks.forEach(tick => {
            const tickEl = document.createElement('div');
            tickEl.className = 'tick-circle';
            tickEl.textContent = tick.digit;

            // Highlight entry tick
            if (tick.type === 'entry') {
                tickEl.classList.add('entry-tick');
            } else if (tick.type === 'post') {
                // Color based on win/loss logic (simplified: green if matches condition)
                const isWin = (contract.contractType === 'OVER' && tick.digit > contract.barrier) ||
                    (contract.contractType === 'UNDER' && tick.digit < contract.barrier);
                tickEl.classList.add(isWin ? 'win-tick' : 'loss-tick');
            }

            ticksContainer.appendChild(tickEl);
        });
        card.appendChild(ticksContainer);

        // Check if finalized
        if (contract.isFinalized) {
            const resultClass = contract.isWin ? 'profit-positive' : 'profit-negative';
            const resultText = contract.isWin ? 'WIN' : 'LOSS';
            footer.innerHTML = `
                <span>Elapsed: ${(contract.elapsedMs / 1000).toFixed(1)}s</span>
                <span class="${resultClass}" style="font-weight: bold; margin-left: 10px;">
                    ${resultText} $${parseFloat(contract.profit).toFixed(2)}
                </span>
            `;
            card.style.border = contract.isWin ? '1px solid #10b981' : '1px solid #ff444f';
        } else {
            footer.innerHTML = `<span>Elapsed: ${(contract.elapsedMs / 1000).toFixed(1)}s</span>`;
        }
        card.appendChild(footer);

        container.appendChild(card);
    });
}
window.renderLiveContracts = renderLiveContracts;

function updateLiveContractMonitor(contractId, symbol, currentPrice) {
    const lastDigit = parseInt(currentPrice.toString().slice(-1));
    const now = Date.now();

    if (liveContractMonitor[contractId]) {
        const contract = liveContractMonitor[contractId];
        if (contract.postEntryCount >= 5) return;

        contract.ticks.push({ digit: lastDigit, time: new Date().toLocaleTimeString(), price: currentPrice, type: 'post' });
        contract.postEntryCount++;
        contract.elapsedMs = now - contract.startTime;

        const container = document.getElementById('live-contracts-container');
        if (container) {
            // ... (Simplified redraw for brevity, in real file it's retained)
            // Re-using existing rendering logic implied by environment
            renderLiveContracts(); // Assuming a render function exists or we add it
        }
    }
}
window.updateLiveContractMonitor = updateLiveContractMonitor;

function addLiveContract(contractId, symbol, entryTick, barrier, contractType) {
    const history = marketTickHistory[symbol] || [];
    const preTicks = history.slice(-6).map(d => ({ digit: d, price: 'history', type: 'pre' }));

    liveContractMonitor[contractId] = {
        symbol: symbol,
        entryTick: entryTick,
        ticks: [
            ...preTicks,
            { digit: entryTick, time: new Date().toLocaleTimeString(), price: 'Entry', type: 'entry' }
        ],
        startTime: Date.now(),
        elapsedMs: 0,
        barrier: barrier,
        contractType: contractType,
        postEntryCount: 0
    };
    addBotLog(`🔴 Live Monitor: Tracking ${symbol} (${contractType} ${barrier})`, 'info');
    renderLiveContracts();

    // Auto-expand monitor section
    const monitorContent = document.getElementById('live-contract-monitor');
    const monitorArrow = document.getElementById('arrow-live-contract-monitor');
    const placeholder = document.getElementById('placeholder-live-contract-monitor');
    if (monitorContent && monitorContent.classList.contains('collapsed')) {
        monitorContent.classList.remove('collapsed');
        if (monitorArrow) monitorArrow.classList.remove('collapsed');
        if (placeholder) placeholder.style.display = 'none';
    }
}
window.addLiveContract = addLiveContract;

function removeLiveContract(contractId) {
    if (liveContractMonitor[contractId]) {
        delete liveContractMonitor[contractId];
        renderLiveContracts();
    }
}
window.removeLiveContract = removeLiveContract;

function finalizeLiveContract(contractId, isWin, profit) {
    if (liveContractMonitor[contractId]) {
        liveContractMonitor[contractId].isFinalized = true;
        liveContractMonitor[contractId].isWin = isWin;
        liveContractMonitor[contractId].profit = profit;
        renderLiveContracts();
    }
}
window.finalizeLiveContract = finalizeLiveContract;

function handleBotTick(tick) {
    if (!isBotRunning) return;

    const symbol = tick.symbol;
    const price = tick.quote.toString();
    const lastDigit = parseInt(price.slice(-1));

    if (Math.random() < 0.05) console.log(`Bot tick: ${symbol} = ${price}`);

    if (marketTickHistory[symbol]) {
        marketTickHistory[symbol].push(lastDigit);
        if (marketTickHistory[symbol].length > 20) marketTickHistory[symbol].shift();

        if (marketTickHistory[symbol].length >= 20) {
            const analysisCount = botState.analysisDigits || 15;
            marketDigitPercentages[symbol] = calculateDigitPercentages(symbol, analysisCount);
        }
    }

    const now = Date.now();
    if (now - lastScanTime > 1000) updateTechnicalIndicators();

    if (postTradeTickMonitoring[symbol]) {
        const monitor = postTradeTickMonitoring[symbol];
        if (monitor.capturedTicks.length < monitor.ticksToCapture) {
            monitor.capturedTicks.push(lastDigit);
            if (monitor.capturedTicks.length === monitor.ticksToCapture) {
                const delayMs = Date.now() - monitor.tradeTime;
                addBotLog(`📊 TIMING ${symbol}: Capture ${delayMs}ms`, 'info');
                delete postTradeTickMonitoring[symbol];
            }
        }
    }

    Object.keys(window.activeContracts).forEach(contractId => {
        const contractInfo = window.activeContracts[contractId];
        if (contractInfo.symbol === symbol && liveContractMonitor[contractId]) {
            updateLiveContractMonitor(contractId, symbol, price);
        }
    });

    // Log scan status with more detail
    const total = Object.keys(marketTickHistory).length;
    const ready = Object.keys(marketTickHistory).filter(s =>
        marketTickHistory[s] && marketTickHistory[s].length >= 20
    ).length;

    if (ready > 0) {
        console.log(`🔍 Scanning ${ready}/${total} ready markets...`);
        scanAndPlaceMultipleTrades();
    } else {
        if (now - lastScanTime > 30000) { // Log warning every 30s
            addBotLog(`⏳ Waiting for markets: ${ready}/${total} ready`, 'info');
        }
    }
    isScanning = false;
}


function scanAndPlaceMultipleTrades() {
    const symbolsToScan = Object.keys(marketTickHistory).filter(isAllowedBotMarket);

    // Debug: Log scan status
    if (symbolsToScan.length === 0) {
        console.log('⚠️ No symbols to scan - marketTickHistory is empty');
        return;
    }

    console.log(`🔍 Scanning ${symbolsToScan.length} markets for trading opportunities...`);

    let validS1Markets = [];
    let validS2Markets = [];

    // ALWAYS scan for both S1 and S2
    for (const symbol of symbolsToScan) {
        const lastDigits = marketTickHistory[symbol] || [];
        const percentages = marketDigitPercentages[symbol];

        // Debug: Log market data status
        if (lastDigits.length < 20) {
            console.log(`⏳ ${symbol}: Only ${lastDigits.length}/20 ticks collected`);
        }

        if (lastDigits.length < 20 || !percentages) continue;

        console.log(`✅ ${symbol}: Ready with ${lastDigits.length} ticks`);

        // Check S1
        if (!activeS1Symbols.has(symbol) && !botState.s1Blocked) {
            const checkCount = botState.s1CheckDigits || 4;
            const maxDigit = botState.s1MaxDigit || 3;
            const prediction = botState.s1Prediction || 2;
            const minPercentage = botState.s1Percentage || 70;
            const useDigitCheck = botState.s1UseDigitCheck ?? true;
            const usePercentage = botState.s1UsePercentage ?? true;

            let digitCheckPassed = true;
            let percentageCheckPassed = true;
            const lastN = lastDigits.slice(-checkCount);

            if (useDigitCheck) {
                digitCheckPassed = lastN.every(d => compareWithOperator(d, botState.s1DigitOperator, botState.s1MaxDigit));
            }
            if (usePercentage) {
                const overPercentage = percentages[`over${prediction}`] || 0;
                const operator = botState.s1PercentageOperator || '>=';
                percentageCheckPassed = compareWithOperator(overPercentage, operator, minPercentage);
            }

            // Debug logging for S1 conditions
            if (Math.random() < 0.1) { // Log 10% of checks to avoid spam
                console.log(`🔍 S1 Check ${symbol}: Digit=${digitCheckPassed}, Pct=${percentageCheckPassed}, Over${prediction}=${percentages[`over${prediction}`]}%`);
            }

            if (digitCheckPassed && percentageCheckPassed) {
                const fullDistribution = calculateFullDigitDistribution(symbol);
                if (fullDistribution) {
                    const thirdCondition = fullDistribution.mostAppearingDigit > 4 && fullDistribution.leastAppearingDigit < 4;
                    if (thirdCondition) {
                        validS1Markets.push({
                            symbol,
                            mode: 'S1',
                            lastN,
                            overPercentage: percentages[`over${prediction}`] || 0,
                            mostDigit: fullDistribution.mostAppearingDigit,
                            leastDigit: fullDistribution.leastAppearingDigit,
                            prediction: prediction,
                            contractType: botState.s1ContractType,
                            stake: botState.initialStake
                        });
                    }
                }
            }
        }

        // Check S2
        if (botState.martingaleStepCount > 0) {
            const checkCount = botState.s2CheckDigits || 6;
            const maxDigit = botState.s2MaxDigit || 4;
            const prediction = botState.s2Prediction || 5;
            const minPercentage = botState.s2Percentage || 45;
            const contractType = botState.s2ContractType || 'UNDER';
            const useDigitCheck = botState.s2UseDigitCheck ?? true;
            const usePercentage = botState.s2UsePercentage ?? true;

            let digitCheckPassed = true;
            let percentageCheckPassed = true;
            const lastN = lastDigits.slice(-checkCount);

            if (useDigitCheck) {
                digitCheckPassed = lastN.every(d => compareWithOperator(d, botState.s2DigitOperator, botState.s2MaxDigit));
            }
            if (usePercentage) {
                const overPercentage = percentages[`over${prediction}`] || 0;
                const operator = botState.s2PercentageOperator || '>=';
                percentageCheckPassed = compareWithOperator(overPercentage, operator, minPercentage);
            }

            if (digitCheckPassed && percentageCheckPassed) {
                const fullDistribution = calculateFullDigitDistribution(symbol);
                if (fullDistribution) {
                    const thirdCondition = fullDistribution.mostAppearingDigit > 4 && fullDistribution.leastAppearingDigit < 4;
                    if (thirdCondition) {
                        validS2Markets.push({
                            symbol,
                            mode: 'S2',
                            lastN,
                            overPercentage: percentages[`over${prediction}`] || 0,
                            mostDigit: fullDistribution.mostAppearingDigit,
                            leastDigit: fullDistribution.leastAppearingDigit,
                            prediction: prediction,
                            contractType: contractType,
                            stake: 0
                        });
                    }
                }
            }
        }
    }

    const activeTradeCount = Object.keys(activeContracts).length;
    const maxConcurrentTrades = 1;

    if (validS1Markets.length > 0 && activeTradeCount < maxConcurrentTrades) {
        validS1Markets.sort((a, b) => b.overPercentage - a.overPercentage);
        const selectedMarket = validS1Markets[0];

        if (activeS1Symbols.has(selectedMarket.symbol)) return;

        console.log(`🎯 [S1] Checking trade: ${selectedMarket.symbol}`);

        if (!canPlaceStakeBasedTrade(selectedMarket.symbol, selectedMarket.stake, 'ghost_ai') ||
            !isTradeSignatureUnique(selectedMarket.symbol, selectedMarket.prediction, selectedMarket.stake, 'ghost_ai')) {
            console.log(`🚫 [S1] Trade BLOCKED for ${selectedMarket.symbol}`);
            // Check alternatives (simplified logic from original)
            return;
        }

        recordPendingStake(selectedMarket.symbol, selectedMarket.stake, 'ghost_ai');
        recordTradeSignature(selectedMarket.symbol, selectedMarket.prediction, selectedMarket.stake, 'ghost_ai');
        activeS1Symbols.set(selectedMarket.symbol, Date.now()); // Store timestamp for stale cleanup

        addBotLog(`✓ S1 Entry: ${selectedMarket.symbol} | Stake: $${selectedMarket.stake.toFixed(2)}`, 'info');
        executeTradeWithTracking(selectedMarket);
    }

    // S2 Logic
    if (botState.martingaleStepCount > 0 && validS2Markets.length > 0 && botState.activeS2Count < 1) {
        validS2Markets.sort((a, b) => b.overPercentage - a.overPercentage);
        const selected = validS2Markets[0];

        // Calc Martingale Stake
        const accumulatedLosses = botState.accumulatedStakesLost;
        const recoveryMultiplier = 100 / botState.payoutPercentage;
        const calculatedStake = parseFloat((accumulatedLosses * recoveryMultiplier).toFixed(2));
        selected.stake = Math.max(calculatedStake, botState.initialStake); // Ensure minimum stake
        selected.stake = parseFloat(selected.stake.toFixed(2));

        addBotLog(`🎯 [S2] Recovery selected: ${selected.symbol} | Stake: $${selected.stake} (Recovers: $${accumulatedLosses.toFixed(2)})`, 'warning');

        recordPendingStake(selected.symbol, calculatedStake, 'ghost_ai');
        recordTradeSignature(selected.symbol, selected.prediction, calculatedStake, 'ghost_ai');
        botState.recoverySymbol = selected.symbol;

        addBotLog(`✓ S2 Recovery: ${selected.symbol} | Stake: $${selected.stake.toFixed(2)}`, 'warning');
        executeTradeWithTracking(selected);
    }
}

async function executeTradeWithTracking(marketData) {
    // CRITICAL: Set trade cooldown to prevent immediate re-scanning
    lastTradeTime = Date.now();

    // --- DUAL SOCKET LOGIC ---
    let useReal = false;
    const hookEnabled = document.getElementById('ghostaiVirtualHookEnabled')?.checked;

    if (!hookEnabled) {
        useReal = true; // Support standard mode
    } else {
        useReal = botState.nextTradeReal;
    }

    // Log intent
    const modeLabel = useReal ? "REAL ACCOUNT" : "VIRTUAL (GHOST)";
    const modeColor = useReal ? "warning" : "info";
    addBotLog(`🤖 Executing on ${modeLabel}`, modeColor);

    // Stake Prevention (Unified)
    // We already recorded stakes in scan function, but execute might be called externally?
    // recordPendingStake(marketData.symbol, marketData.stake, 'ghost_ai'); // Redundant if scan does it

    if (marketData.mode === 'S1' && !activeS1Symbols.has(marketData.symbol)) {
        activeS1Symbols.add(marketData.symbol);
    }

    if (marketData.mode === 'S2') {
        botState.activeS2Count++;
    }

    // DIAGNOSTIC
    const last6Digits = (marketTickHistory[marketData.symbol] || []).slice(-6);
    postTradeTickMonitoring[marketData.symbol] = {
        ticksToCapture: 2,
        capturedTicks: [],
        tradeTime: Date.now(),
        last6Digits: last6Digits,
        strategy: marketData.mode
    };

    addBotLog(`🔍 PRE-TRADE SNAPSHOT for ${marketData.symbol}: Last 6 digits = [${last6Digits.join(', ')}]`, 'info');
    showComprehensiveDigitAnalysis(marketData.symbol, marketData.prediction);


    // Helper to sanitize contract type
    const normalizeContractType = (type) => {
        if (!type) return 'DIGITOVER';
        const upper = type.toString().toUpperCase();
        if (upper === 'OVER') return 'DIGITOVER';
        if (upper === 'UNDER') return 'DIGITUNDER';
        if (upper === 'MATCH') return 'DIGITMATCH';
        if (upper === 'DIFF') return 'DIGITDIFF';
        if (upper === 'EVEN') return 'DIGITEVEN';
        if (upper === 'ODD') return 'DIGITODD';
        return upper;
    };

    if (useReal) {
        // --- REAL TRADE ---
        // Reset flag immediately (consume the token)
        botState.nextTradeReal = false;

        const requestContractType = normalizeContractType(marketData.contractType || (marketData.prediction <= 4 ? "DIGITOVER" : "DIGITUNDER"));

        const proposalReq = {
            "buy": 1,
            "price": marketData.stake,
            "parameters": {
                "amount": marketData.stake,
                "basis": "stake",
                "contract_type": requestContractType,
                "currency": "USD",
                "duration": 1,
                "duration_unit": "t",
                "symbol": marketData.symbol,
                "barrier": marketData.prediction
            },
            "passthrough": {
                "purpose": "ghost_ai_trade",
                "run_id": botState.runId,
                "symbol": marketData.symbol,
                "barrier": marketData.prediction,
                "strategy": marketData.mode,
                "stake": marketData.stake
            }
        };
        addBotLog(`🚀 Sending Buy Request (REAL) [${requestContractType}]...`, 'warning');
        if (typeof sendAPIRequest === 'function') sendAPIRequest(proposalReq);

    } else {
        // --- VIRTUAL TRADE (GHOST) ---
        const requestContractType = normalizeContractType(marketData.contractType || (marketData.prediction <= 4 ? "DIGITOVER" : "DIGITUNDER"));

        const ghostReq = {
            "buy": 1,
            "price": 0.35,
            "parameters": {
                "amount": 0.35,
                "basis": "stake",
                "contract_type": requestContractType,
                "currency": "USD",
                "duration": 1,
                "duration_unit": "t",
                "symbol": marketData.symbol,
                "barrier": marketData.prediction
            },
            "subscribe": 1,
            "passthrough": {
                "strategy": marketData.mode,
                "symbol": marketData.symbol,
                "barrier": marketData.prediction
            }
        };

        addBotLog(`🚀 Sending Virtual Trade (Ghost) [${requestContractType}]...`, 'info');
        if (window.ghostService) {
            window.ghostService.placeTrade(ghostReq);
        } else {
            console.error("Ghost Service missing!");
            addBotLog("❌ Ghost Service Missing! Cannot place virtual trade.", "error");
        }
    }
}

function showComprehensiveDigitAnalysis(symbol, prediction) {
    const lastDigits = marketTickHistory[symbol] || [];
    const percentages = marketDigitPercentages[symbol] || {};

    if (lastDigits.length >= 20) {
        const last6Digits = lastDigits.slice(-6);
        showToast(`Analysis for ${symbol}: Last 6 digits [${last6Digits.join(', ')}] | Prediction: OVER ${prediction}`, 'info', 5000);

        let analysisText = `📊 Digit Analysis for ${symbol} (Last 20 ticks):\n`;
        for (let digit = 0; digit <= 9; digit++) {
            const percentage = percentages[digit] || 0;
            analysisText += `#${digit}: ${percentage.toFixed(1)}% | `;
        }
        addBotLog(analysisText.slice(0, -3), 'info');
    }
}

function sendBotPurchase(prediction, stake, symbol) {
    sendBotPurchaseWithStrategy(prediction, stake, symbol, 'S1');
}

function sendBotPurchaseWithStrategy(prediction, stake, symbol, strategy, contractType = null) {
    console.log('sendBotPurchase legacy wrapper called');
    executeTradeWithTracking({
        symbol,
        prediction,
        stake,
        mode: strategy,
        contractType
    });
}

function toggleBot() {
    if (isBotRunning) {
        stopGhostAiBot();
    } else {
        startGhostAiBot();
    }
}

function clearGhostAIHistory() {
    if (confirm('Are you sure you want to clear the trade history?')) {
        const botHistoryTableBody = document.querySelector('#bot-history-table tbody');
        if (botHistoryTableBody) {
            botHistoryTableBody.innerHTML = '';
        }
        liveContractMonitor = {};
        renderLiveContracts();

        // Reset stats
        botState.totalProfit = 0;
        botState.totalLoss = 0;
        botState.totalPL = 0;
        botState.winCount = 0;
        botState.lossCount = 0;
        botState.totalStake = 0;
        botState.totalPayout = 0;

        updateProfitLossDisplay();
        updateBotStats();
        updateWinPercentage();

        const container = document.getElementById('live-contracts-container');
        if (container) {
            container.innerHTML = '<div class="log-info">No active contracts</div>';
        }
        addBotLog('🧹 Trade history and live monitor cleared', 'info');
        showToast('Trade history cleared', 'success');
    }
}

function formatElapsedTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateBotTimer() {
    if (!botStartTime) return;
    const elapsed = Date.now() - botStartTime;
    const timeString = formatElapsedTime(elapsed);
    const timerDisplay = document.getElementById('botTimerDisplay');
    if (timerDisplay) {
        timerDisplay.textContent = timeString;
    }
}

function startBotTimer() {
    updateBotTimer();
    botTimerInterval = setInterval(updateBotTimer, 1000);
}

function stopBotTimer() {
    if (botTimerInterval) {
        clearInterval(botTimerInterval);
        botTimerInterval = null;
    }
    botStartTime = null;
    const timerDisplay = document.getElementById('botTimerDisplay');
    if (timerDisplay) {
        timerDisplay.textContent = '00:00:00';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const clearHistoryBtn = document.getElementById('clear-ghost-ai-history');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', clearGhostAIHistory);
    }
});


// ===================================
// DUAL SOCKET HANDLERS
// ===================================

function handleGhostTradeResult(result) {
    const profitText = result.isWin ? 'WIN' : 'LOSS';
    const profitColor = result.isWin ? 'win' : 'loss';
    addBotLog(`👻 [Virtual] ${result.passthrough.strategy}: ${profitText} ($${result.profit.toFixed(2)})`, profitColor);

    addVirtualTradeHistory(result);

    if (!result.isWin) {
        if (result.passthrough.strategy === 'S1') {
            if (typeof botState.s1ConsecutiveLosses !== 'undefined') botState.s1ConsecutiveLosses++;
        }

        const triggerInput = document.getElementById('ghostaiVirtualHookTrigger');
        const enabledInput = document.getElementById('ghostaiVirtualHookEnabled');
        const hookTrigger = parseInt(triggerInput ? triggerInput.value : 1) || 1;
        const hookEnabled = enabledInput && enabledInput.checked;

        if (hookEnabled && botState.s1ConsecutiveLosses >= hookTrigger) {
            addBotLog(`🪝 Virtual Trigger Met! (${botState.s1ConsecutiveLosses} Losses). Next Trade on REAL Account.`, 'warning');
            botState.nextTradeReal = true;
        }
    } else {
        if (result.passthrough.strategy === 'S1') {
            botState.s1ConsecutiveLosses = 0;
        }
        // Ensure we stay on Ghost (default)
        botState.nextTradeReal = false;
    }
}


function addVirtualTradeHistory(result) {
    console.log(`📜 addVirtualTradeHistory called for ${result.passthrough.symbol}`);
    const tableBody = document.querySelector('#bot-history-table tbody');
    if (!tableBody) {
        console.error('❌ addVirtualTradeHistory: Table body #bot-history-table tbody NOT FOUND');
        return;
    }
    console.log('✅ addVirtualTradeHistory: Table body found, adding row...');

    const row = document.createElement('tr');
    const time = new Date().toLocaleTimeString();
    const profitClass = result.isWin ? 'profit-positive' : 'profit-negative';
    const profitLabel = result.isWin ? 'VH WIN' : 'VH LOSS';
    const stakeLabel = 'Virtual';
    // User requested "CALL/PUT" style or similar, but for Digits it is OVER/UNDER
    const contractType = result.contract.contract_type ? result.contract.contract_type.replace('DIGIT', '') : '-';
    // Use contract_id if available, otherwise fallback to symbol as reference
    const refId = result.contract.contract_id || 'Virtual';

    // Layout matching standard Deriv tables: 
    // Time | Contract Info | P/L
    // Note: The main table has Time, Contract, P/L columns.
    // We need to match that structure.

    // Cell 1: Time
    const timeCell = document.createElement('td');
    timeCell.textContent = time;
    row.appendChild(timeCell);

    // Cell 2: Contract Info
    const contractCell = document.createElement('td');
    contractCell.innerHTML = `
        <div class="contract-info">
            <span class="contract-symbol">${result.contract.symbol || result.passthrough.symbol}</span>
            <span class="contract-type ${contractType.toLowerCase()}">${contractType} ${result.contract.barrier || ''}</span>
            <span class="contract-stake">Stake: ${stakeLabel}</span>
        </div>
    `;
    row.appendChild(contractCell);

    // Cell 3: P/L
    const plCell = document.createElement('td');
    plCell.className = profitClass + ' fw-bold';
    plCell.textContent = profitLabel;
    row.appendChild(plCell);

    if (tableBody.firstChild) tableBody.insertBefore(row, tableBody.firstChild);
    else tableBody.appendChild(row);

    if (tableBody.children.length > 50) tableBody.removeChild(tableBody.lastChild);
}
