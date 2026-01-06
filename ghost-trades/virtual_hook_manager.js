// ===================================
// UNIVERSAL VIRTUAL HOOK MANAGER
// Works across all bots (Ghost AI, Ghost E/ODD, AI Strategy)
// ===================================

class VirtualHookManager {
    constructor() {
        this.config = {
            enabled: false,
            triggerType: 'LOSS',      // 'LOSS' or 'WIN'
            triggerCount: 1,
            fixedStake: null,
            resetOnOpposite: true      // Reset counter on opposite result
        };
        
        this.state = {
            // Per bot, per symbol tracking
            streaks: {},              // { botName: { symbol: { wins: 0, losses: 0 } } }
            virtualOrders: {},        // { botName: { symbol: { action, barrier, tick, timestamp } } }
            isRealTradeActive: {}     // { botName: { symbol: boolean } }
        };
        
        console.log('✅ Virtual Hook Manager initialized');
    }
    
    /**
     * Enable virtual hook for a specific bot
     * @param {string} botName - Name of the bot (e.g., 'ghost_ai', 'ghost_eodd', 'ai_strategy')
     * @param {object} config - Configuration object
     */
    enableForBot(botName, config) {
        if (!this.state.streaks[botName]) {
            this.state.streaks[botName] = {};
            this.state.virtualOrders[botName] = {};
            this.state.isRealTradeActive[botName] = {};
        }
        
        this.config = { ...this.config, ...config };
        
        console.log(`🪝 Virtual Hook enabled for ${botName}:`, this.config);
    }
    
    /**
     * Check if we should trade REAL or VIRTUAL
     * @param {string} botName - Name of the bot
     * @param {string} symbol - Market symbol
     * @returns {boolean} - True if should trade REAL, false if should trade VIRTUAL
     */
    shouldTradeReal(botName, symbol) {
        if (!this.config.enabled) return true;
        
        // Initialize streak if not exists
        if (!this.state.streaks[botName]) this.state.streaks[botName] = {};
        if (!this.state.streaks[botName][symbol]) {
            this.state.streaks[botName][symbol] = { wins: 0, losses: 0 };
        }
        
        const streak = this.state.streaks[botName][symbol];
        const triggerCount = this.config.triggerCount;
        const triggerType = this.config.triggerType;
        
        // Check if threshold is met
        if (triggerType === 'LOSS' && streak.losses >= triggerCount) {
            console.log(`✅ ${botName} ${symbol}: Virtual threshold met (${streak.losses} losses) - Trading REAL`);
            return true; // Trade REAL after N virtual losses
        }
        if (triggerType === 'WIN' && streak.wins >= triggerCount) {
            console.log(`✅ ${botName} ${symbol}: Virtual threshold met (${streak.wins} wins) - Trading REAL`);
            return true; // Trade REAL after N virtual wins
        }
        
        console.log(`👻 ${botName} ${symbol}: Trading VIRTUAL (${triggerType}: ${triggerType === 'LOSS' ? streak.losses : streak.wins}/${triggerCount})`);
        return false; // Trade VIRTUAL
    }
    
    /**
     * Record a virtual order (to evaluate next tick)
     * @param {string} botName - Name of the bot
     * @param {string} symbol - Market symbol
     * @param {string} action - Trade action (e.g., 'DIGITOVER', 'DIGITEVEN')
     * @param {number} barrier - Barrier for digit trades (0-9)
     * @param {number} currentTick - Current tick price
     */
    recordVirtualOrder(botName, symbol, action, barrier, currentTick) {
        if (!this.state.virtualOrders[botName]) {
            this.state.virtualOrders[botName] = {};
        }
        
        this.state.virtualOrders[botName][symbol] = {
            action: action,
            barrier: barrier,
            entryTick: currentTick,
            timestamp: Date.now()
        };
        
        console.log(`👻 Virtual order recorded for ${botName} ${symbol}: ${action} ${barrier !== undefined ? barrier : ''}`);
    }
    
    /**
     * Evaluate virtual order result on next tick
     * @param {string} botName - Name of the bot
     * @param {string} symbol - Market symbol
     * @param {number} currentTick - Current tick price
     * @returns {object|null} - Result object or null if no order exists
     */
    evaluateVirtualResult(botName, symbol, currentTick) {
        const order = this.state.virtualOrders[botName]?.[symbol];
        if (!order) return null;
        
        const isWin = this.checkWinCondition(order.action, order.barrier, currentTick);
        
        // Initialize streak if not exists
        if (!this.state.streaks[botName]) this.state.streaks[botName] = {};
        if (!this.state.streaks[botName][symbol]) {
            this.state.streaks[botName][symbol] = { wins: 0, losses: 0 };
        }
        
        const streak = this.state.streaks[botName][symbol];
        
        if (isWin) {
            streak.wins++;
            // Reset opposite counter if configured
            if (this.config.resetOnOpposite && this.config.triggerType === 'LOSS') {
                streak.losses = 0;
            }
        } else {
            streak.losses++;
            // Reset opposite counter if configured
            if (this.config.resetOnOpposite && this.config.triggerType === 'WIN') {
                streak.wins = 0;
            }
        }
        
        // Clear the order
        delete this.state.virtualOrders[botName][symbol];
        
        const currentStreak = this.config.triggerType === 'WIN' ? streak.wins : streak.losses;
        
        console.log(`👻 Virtual ${isWin ? 'WIN' : 'LOSS'} for ${botName} ${symbol} (Streak: ${currentStreak}/${this.config.triggerCount})`);
        
        return {
            isWin: isWin,
            currentStreak: currentStreak,
            required: this.config.triggerCount,
            resultType: isWin ? 'WIN' : 'LOSS'
        };
    }
    
    /**
     * Check win condition based on contract type
     * @param {string} action - Trade action
     * @param {number} barrier - Barrier value
     * @param {number} currentTick - Current tick price
     * @returns {boolean} - True if win, false if loss
     */
    checkWinCondition(action, barrier, currentTick) {
        const lastDigit = parseInt(currentTick.toString().slice(-1));
        
        switch(action) {
            case 'DIGITOVER':
                return lastDigit > barrier;
            case 'DIGITUNDER':
                return lastDigit < barrier;
            case 'DIGITMATCH':
                return lastDigit === barrier;
            case 'DIGITDIFF':
                return lastDigit !== barrier;
            case 'DIGITEVEN':
                return lastDigit % 2 === 0;
            case 'DIGITODD':
                return lastDigit % 2 !== 0;
            case 'CALL':
                // For CALL/PUT we can't determine without next tick - assume win for now
                console.warn('⚠️ Virtual Hook: CALL/PUT not fully supported in virtual mode');
                return Math.random() > 0.5; // Placeholder
            case 'PUT':
                console.warn('⚠️ Virtual Hook: CALL/PUT not fully supported in virtual mode');
                return Math.random() > 0.5; // Placeholder
            default:
                console.error(`Unknown action type: ${action}`);
                return false;
        }
    }
    
    /**
     * Reset streak for a symbol (on real trade placed or manual reset)
     * @param {string} botName - Name of the bot
     * @param {string} symbol - Market symbol
     */
    resetSymbol(botName, symbol) {
        if (this.state.streaks[botName]?.[symbol]) {
            this.state.streaks[botName][symbol] = { wins: 0, losses: 0 };
            console.log(`🔄 Virtual streak reset for ${botName} ${symbol}`);
        }
        if (this.state.virtualOrders[botName]?.[symbol]) {
            delete this.state.virtualOrders[botName][symbol];
        }
    }
    
    /**
     * Clear all data for a bot (on bot stop)
     * @param {string} botName - Name of the bot
     */
    clearBot(botName) {
        delete this.state.streaks[botName];
        delete this.state.virtualOrders[botName];
        delete this.state.isRealTradeActive[botName];
        console.log(`🧹 Virtual hook data cleared for ${botName}`);
    }
    
    /**
     * Get current streak for display
     * @param {string} botName - Name of the bot
     * @param {string} symbol - Market symbol
     * @returns {object} - Streak information
     */
    getStreak(botName, symbol) {
        if (!this.state.streaks[botName]?.[symbol]) {
            return { wins: 0, losses: 0 };
        }
        return this.state.streaks[botName][symbol];
    }
    
    /**
     * Check if there's a pending virtual order
     * @param {string} botName - Name of the bot
     * @param {string} symbol - Market symbol
     * @returns {boolean} - True if pending order exists
     */
    hasPendingVirtualOrder(botName, symbol) {
        return !!(this.state.virtualOrders[botName]?.[symbol]);
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.virtualHookManager = new VirtualHookManager();
    console.log('✅ Global Virtual Hook Manager created');
}