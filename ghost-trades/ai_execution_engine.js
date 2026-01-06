// ===================================
// AI STRATEGY EXECUTION ENGINE
// ===================================

class AIStrategyRunner {
    constructor() {
        this.isActive = false;
        this.strategyCode = null;
        this.compiledStrategy = null;
        this.runtimeLogs = [];
        this.maxLogs = 50;
        this.executionCount = 0;
        this.lastExecutionTime = 0;
        this.errors = 0;
        this.consecutiveErrors = 0;
        this.allowedMarkets = []; // List of symbols allowed to trade
    }

    /**
     * Compiles the raw code string into an executable function
     * @param {string} code - The function body code
     * @returns {boolean} - Success status
     */
    compile(code) {
        try {
            this.strategyCode = code;
            // Create a function that takes specific safe arguments
            // "use strict" prevents accidental global variable creation
            this.compiledStrategy = new Function('data', 'signal', 'log', '"use strict";\n' + code);
            this.resetStats();
            return true;
        } catch (error) {
            console.error('Compilation Error:', error);
            this.log(`Compilation Error: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Start the strategy execution
     * @param {Array<string>} markets - List of selected market symbols (e.g. ['R_100', '1HZ10V'])
     */
    start(markets = []) {
        if (!this.compiledStrategy) {
            this.log('No strategy compiled. Please generate or write code first.', 'error');
            return false;
        }

        if (!markets || markets.length === 0) {
            this.log('No markets selected. Please select at least one market.', 'error');
            return false;
        }

        // CRITICAL: Real account confirmation
        if (typeof confirmRealAccountBotStart === 'function') {
            if (!confirmRealAccountBotStart('AI Strategy Bot')) {
                this.log('AI Strategy start cancelled (Real Account Safety)', 'warning');
                return false; // User cancelled
            }
        }

        this.allowedMarkets = markets;
        this.isActive = true;
        this.resetStats();

        // Initialize Virtual Hook (if manager exists)
        if (typeof window.virtualHookManager !== 'undefined') {
            const vHookEnabled = document.getElementById('ai-virtual-hook-toggle')?.checked || false;
            const vHookTrigger = 'LOSS'; // Default for AI Strategy
            const vHookCount = 1;

            window.virtualHookManager.enableForBot('ai_strategy', {
                enabled: vHookEnabled,
                triggerType: vHookTrigger,
                triggerCount: vHookCount,
                fixedStake: null
            });

            if (vHookEnabled) {
                this.log(`🪝 Virtual Hook ENABLED: Testing strategies virtually first`, 'warning');
            }
        }

        // Update emergency button visibility
        if (typeof updateEmergencyButtonVisibility === 'function') {
            updateEmergencyButtonVisibility();
        }

        this.log(`Strategy execution started on markets: ${markets.join(', ')}`, 'success');
        return true;
    }

    /**
     * Stop the strategy execution
     */
    stop() {
        this.isActive = false;
        this.allowedMarkets = [];

        // Clear virtual hook data
        if (typeof window.virtualHookManager !== 'undefined') {
            window.virtualHookManager.clearBot('ai_strategy');
        }

        // Update emergency button visibility
        if (typeof updateEmergencyButtonVisibility === 'function') {
            updateEmergencyButtonVisibility();
        }

        this.log('Strategy execution stopped.', 'warning');
    }

    resetStats() {
        this.executionCount = 0;
        this.errors = 0;
        this.consecutiveErrors = 0;
    }

    /**
     * Main execution loop called on every tick
     * @param {Object} tickContext - The market data context
     */
    execute(tickContext) {
        if (!this.isActive || !this.compiledStrategy) return;

        // FILTER: Only run for selected markets
        if (!this.allowedMarkets.includes(tickContext.symbol)) {
            return;
        }

        // SAFETY: Ensure digit history exists and has data
        if (!tickContext.digits || tickContext.digits.length === 0) {
            // Fallback: Try to get from global digitHistory
            if (window.digitHistory && window.digitHistory[tickContext.symbol]) {
                tickContext.digits = window.digitHistory[tickContext.symbol];
            } else {
                // Not enough data yet, skip execution
                return;
            }
        }

        // --- VIRTUAL HOOK EVALUATION ---
        if (typeof window.virtualHookManager !== 'undefined') {
            // Check if we have a pending virtual order for this symbol
            if (window.virtualHookManager.hasPendingVirtualOrder('ai_strategy', tickContext.symbol)) {

                // Evaluate it using the CURRENT tick (which is "next" relative to when order was placed)
                const result = window.virtualHookManager.evaluateVirtualResult('ai_strategy', tickContext.symbol, tickContext.quote);

                if (result) {
                    // Log result to UI
                    if (typeof window.updateAIHistoryTable === 'function') {
                        const virtualContract = {
                            symbol: tickContext.symbol,
                            isVirtual: true,
                            profit: result.isWin ? 1 : -1 // Dummy profit for display
                        };
                        window.updateAIHistoryTable(virtualContract, result.isWin ? 1 : -1);
                    }

                    const resultType = result.isWin ? 'WIN' : 'LOSS';
                    this.log(`👻 Virtual Result: ${resultType} (Streak: ${result.currentStreak}/${result.required})`, result.isWin ? 'success' : 'warning');

                    // If Trigger Met, Notify User
                    if (window.virtualHookManager.shouldTradeReal('ai_strategy', tickContext.symbol)) {
                        // Only if we just crossed the threshold
                        const streak = window.virtualHookManager.getStreak('ai_strategy', tickContext.symbol);
                        // Simple check: if streak matches requirement exactly, assume it just happened
                        if ((result.resultType === 'LOSS' && streak.losses === result.required) ||
                            (result.resultType === 'WIN' && streak.wins === result.required)) {
                            this.log(`🪝 HOOK ACTIVATED on ${tickContext.symbol}! Next trade will be REAL.`, 'warning');
                        }
                    }
                }

                // Do NOT return here. We want to continue to execute the strategy to potentially place the NEXT trade (which might be real now)
                // However, strategy execution usually relies on new ticks. If we just evaluated a virtual result, 
                // the strategy logic below will run on this SAME tick. This is correct: we see the result, and decide what to do next.
            }
        }
        // -------------------------------

        // Prepare safe API functions
        const signal = (type, stake, barrier) => this.handleSignal(type, stake, tickContext.symbol, barrier);
        const log = (msg) => this.log(msg, 'info');

        try {
            // Execute the strategy
            this.compiledStrategy(tickContext, signal, log);
            this.executionCount++;
            this.consecutiveErrors = 0; // Reset consecutive errors on success
        } catch (error) {
            this.errors++;
            this.consecutiveErrors++;
            this.log(`Runtime Error: ${error.message}`, 'error');

            // Safety: Stop if too many consecutive errors
            if (this.consecutiveErrors >= 5) {
                this.stop();
                this.log('Strategy stopped due to 5 consecutive runtime errors.', 'error');
            }
        }
    }

    /**
     * Handles trade signals generated by the strategy
     */
    handleSignal(type, stake, symbol, barrier = null) {
        if (!this.isActive) return;

        // Validate signal
        const validTypes = ['CALL', 'PUT', 'DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD'];
        if (!validTypes.includes(type)) {
            this.log(`Invalid signal type: ${type}`, 'warning');
            return;
        }

        if (isNaN(stake) || stake <= 0) {
            this.log(`Invalid stake: ${stake}`, 'warning');
            return;
        }

        // --- VIRTUAL HOOK LOGIC CHECK ---
        let isRealTrade = true;

        if (typeof window.virtualHookManager !== 'undefined') {
            // Ask manager: Should we trade real or virtual?
            isRealTrade = window.virtualHookManager.shouldTradeReal('ai_strategy', symbol);

            if (!isRealTrade) {
                // VIRTUAL MODE: Record the order and SKIP execution
                // Get latest tick for recording purposes
                let currentTick = 0;
                if (window.marketTickHistory && window.marketTickHistory[symbol]) {
                    const history = window.marketTickHistory[symbol];
                    if (history.length > 0) currentTick = history[history.length - 1].quote;
                }

                window.virtualHookManager.recordVirtualOrder('ai_strategy', symbol, type, barrier, currentTick);
                this.log(`👻 Virtual Order Recorded: ${type} on ${symbol}. Waiting for result...`, 'info');
                return; // SKIP REAL TRADE
            }
        }
        // --------------------------------

        let logMsg = `Signal Generated: ${type} $${stake} on ${symbol}`;
        if (barrier !== null) logMsg += ` (Barrier: ${barrier})`;
        this.log(logMsg, 'success');

        // Trigger buy in the main app
        if (typeof window.executeAIStratTrade === 'function') {
            window.executeAIStratTrade(type, stake, symbol, barrier);

            // RESET VIRTUAL HOOK FOR THIS SYMBOL AFTER REAL TRADE
            if (typeof window.virtualHookManager !== 'undefined') {
                window.virtualHookManager.resetSymbol('ai_strategy', symbol);
            }

        } else {
            console.warn('executeAIStratTrade function not found in global scope');
            this.log('Error: Trade execution function missing.', 'error');
        }
    }

    /**
     * internal logger
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { time: timestamp, message, type };

        this.runtimeLogs.push(logEntry);
        if (this.runtimeLogs.length > this.maxLogs) {
            this.runtimeLogs.shift();
        }

        // Update UI if binding exists
        if (typeof window.updateAILogs === 'function') {
            window.updateAILogs(logEntry);
        } else {
            // Fallback console log for debug
            console.log(`[AI Strategy] ${message}`);
        }
    }
}

// Export singleton instance
window.aiStrategyRunner = new AIStrategyRunner();
