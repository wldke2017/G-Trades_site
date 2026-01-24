// ===================================
// TRADING INTERFACE FUNCTIONS
// ===================================

// Track balance subscription ID to cancel when switching accounts
let currentBalanceSubscriptionId = null;

// Custom lookback count for digit distribution (default: 1000)
let distributionLookbackCount = 1000;

function requestBalance() {
    // Cancel previous balance subscription if it exists
    if (currentBalanceSubscriptionId) {
        console.log('🔄 Cancelling previous balance subscription:', currentBalanceSubscriptionId);
        sendAPIRequest({ "forget": currentBalanceSubscriptionId }).catch(e => console.error("Forget Balance Error:", e));
        currentBalanceSubscriptionId = null;
    }

    const balanceRequest = { "balance": 1, "subscribe": 1 };
    sendAPIRequest(balanceRequest).catch(e => console.error("Balance Request Error:", e));
}

function requestActiveSymbols() {
    const symbolsRequest = { "active_symbols": "brief", "product_type": "basic" };
    sendAPIRequest(symbolsRequest).catch(e => console.error("Active Symbols Error:", e));
}

function subscribeToAllVolatilities() {
    if (typeof activeSymbols === 'undefined' || !activeSymbols || activeSymbols.length === 0) {
        console.warn("⚠️ No active symbols available to subscribe to.");
        return;
    }

    console.log('🔍 Debugging activeSymbols array:', activeSymbols);
    console.log('🔍 Total symbols received:', activeSymbols.length);

    // Debug: Show all markets available
    const markets = [...new Set(activeSymbols.map(s => s.market))];
    console.log('🔍 Available markets:', markets);

    // Debug: Show ALL symbols and their markets
    console.log('🔍 All available symbols:');
    activeSymbols.forEach(symbol => {
        console.log(`  - ${symbol.symbol} (${symbol.market})`);
    });

    // Debug: Show synthetic indices specifically
    const syntheticSymbols = activeSymbols.filter(s => s.market === 'synthetic_index');
    console.log('🔍 Synthetic indices found:', syntheticSymbols.length);
    syntheticSymbols.forEach(symbol => {
        console.log(`  - ${symbol.symbol} (${symbol.market})`);
    });

    // Try different market name variations
    const alternativeSynthetic = activeSymbols.filter(s =>
        s.market === 'synthetic_index' ||
        s.market === 'synthetic' ||
        s.market === 'volatility' ||
        s.market === 'derived'
    );
    console.log('🔍 Alternative synthetic market names:', alternativeSynthetic.length);

    // Filter for ALLOWED synthetic indices (Volatility, Jump, Daily Reset)
    const volatilitySymbols = activeSymbols
        .filter(symbol => isAllowedBotMarket(symbol.symbol))
        .map(symbol => symbol.symbol);

    console.log(`✅ Subscribing to ${volatilitySymbols.length} synthetic indices:`, volatilitySymbols);

    if (volatilitySymbols.length === 0) {
        console.warn("⚠️ No synthetic indices found! This will prevent the bot from working.");
        console.warn("⚠️ Check if active_symbols request succeeded and contains synthetic_index market symbols.");

        // Try subscribing to ALL symbols as fallback
        const allSymbols = activeSymbols.map(s => s.symbol);
        console.log('🔄 Fallback: Subscribing to ALL available symbols:', allSymbols);

        volatilitySymbols.push(...allSymbols);
    }

    sendAPIRequest({ "forget_all": "ticks" });

    // Initialize multi-market dashboard UI
    initMultiMarketDashboard(volatilitySymbols);

    volatilitySymbols.forEach((symbol, index) => {
        // Subscribe to real-time ticks
        console.log(`📡 Subscribing to real-time ticks for ${symbol}...`);
        sendAPIRequest({
            "ticks": symbol,
            "subscribe": 1
        });

        // Initialize market tick history
        marketTickHistory[symbol] = [];
        marketDigitPercentages[symbol] = {
            0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0
        };
        marketFullTickDigits[symbol] = [];

        // Fetch historical tick data for distribution analysis (uses custom lookback count)
        fetchTickHistory(symbol, distributionLookbackCount);

        if (!document.getElementById(`row-${symbol}`)) {
            const row = tickerTableBody.insertRow();
            row.id = `row-${symbol}`;

            const symbolCell = row.insertCell(0);
            let displayName = getMarketDisplayName(symbol);
            symbolCell.textContent = displayName;

            row.insertCell(1).textContent = '--';
            row.insertCell(2).textContent = '--';
        }
    });
}

/**
 * Initializes the Multi-Market Dashboard UI
 */
function initMultiMarketDashboard(symbols) {
    const dashboard = document.getElementById('multiMarketDashboard');
    if (!dashboard) return;

    dashboard.innerHTML = ''; // Clear existing
    dashboard.style.display = 'flex';

    symbols.forEach(symbol => {
        const rowHtml = generateMarketGaugeRow(symbol);
        dashboard.insertAdjacentHTML('beforeend', rowHtml);
    });
}

/**
 * Generates HTML for a single market row in the dashboard
 */
function generateMarketGaugeRow(symbol) {
    const displayName = getMarketDisplayName(symbol);

    let gaugesHtml = '';
    for (let i = 0; i <= 9; i++) {
        gaugesHtml += `
            <div class="circular-gauge-container" id="gauge-container-${symbol}-${i}">
                <div class="gauge-svg-wrapper">
                    <svg class="gauge-svg" viewBox="0 0 40 40">
                        <circle class="gauge-bg" cx="20" cy="20" r="16"></circle>
                        <circle class="gauge-progress" id="gauge-path-${symbol}-${i}" cx="20" cy="20" r="16" 
                            stroke-dasharray="0 100"></circle>
                    </svg>
                    <div class="gauge-content">
                        <span class="gauge-digit">${i}</span>
                        <span class="gauge-percent-val" id="gauge-val-${symbol}-${i}">0%</span>
                    </div>
                </div>
                <div class="hot-indicator-dot"></div>
            </div>
        `;
    }

    return `
        <div class="market-gauge-row" id="market-row-${symbol}">
            <div class="market-header">
                <div class="market-info-main">
                    <span class="market-name-tag">${displayName}</span>
                    <span class="market-price-tag" id="market-price-${symbol}">0.0000</span>
                </div>
            </div>
            <div class="gauges-grid">
                ${gaugesHtml}
            </div>
        </div>
    `;
}

/**
 * Helper to get clean market display name
 */
function getMarketDisplayName(symbol) {
    let displayName = symbol;
    if (symbol.startsWith('R_')) displayName = symbol.replace('R_', 'Vol ');
    else if (symbol.startsWith('1HZ')) displayName = symbol.replace('1HZ', 'Vol ').replace('V', '');
    else if (symbol.startsWith('JD')) displayName = symbol.replace('JD', 'Jump ');
    else if (symbol.includes('CRASH')) displayName = symbol.replace('CRASH', 'Crash ');
    else if (symbol.includes('BOOM')) displayName = symbol.replace('BOOM', 'Boom ');
    else if (symbol.includes('RDBEAR')) displayName = 'Bear Market Index';
    else if (symbol.includes('RDBULL')) displayName = 'Bull Market Index';
    else if (symbol === 'STPIDX') displayName = 'Step Index';

    if (symbol.startsWith('1HZ') || symbol.includes('1s')) {
        displayName += ' (1s)';
    }
    return displayName;
}

/**
 * Refreshes all market distributions by fetching historical data
 */
async function refreshAllMarketDistributions() {
    const skeleton = document.getElementById('digitAnalysisSkeleton');
    const dashboard = document.getElementById('multiMarketDashboard');

    if (skeleton && dashboard) {
        skeleton.style.display = 'block';
        dashboard.style.display = 'none';
    }

    try {
        // Use snapshot API for massive efficiency
        const response = await fetch('http://localhost:3000/api/snapshot');
        if (response.ok) {
            const snapshot = await response.json();
            Object.keys(snapshot).forEach(symbol => {
                const data = snapshot[symbol];
                if (data && data.last_1000_ticks) {
                    marketFullTickDigits[symbol] = data.last_1000_ticks;
                    updateDigitAnalysisDisplay(symbol);
                }
            });
        }
    } catch (e) {
        console.warn('⚠️ Manual refresh fallback...');
        const markets = Object.keys(marketFullTickDigits);
        for (const symbol of markets) {
            await fetchTickHistory(symbol, distributionLookbackCount);
        }
    }

    if (skeleton && dashboard) {
        skeleton.style.display = 'none';
        dashboard.style.display = 'flex';
    }
}

/**
 * Sets the distribution lookback and refreshes data
 */
window.setDistributionLookback = function (value) {
    distributionLookbackCount = parseInt(value);
    console.log(`📏 Set distribution lookback to ${distributionLookbackCount}`);

    // Refresh all markets with new lookback
    refreshAllMarketDistributions();

    if (typeof showToast === 'function') {
        showToast(`Lookback set to ${distributionLookbackCount} ticks`, 'info');
    }
};

function requestMarketData(symbol) {
    if (!currentChart) initializeChart();
    CHART_MARKET = symbol;

    const historyRequest = {
        "ticks_history": symbol,
        "end": "latest",
        "count": 400,
        "adjust_start_time": 1,
        "style": "candles",
        "granularity": CHART_INTERVAL,
        "subscribe": 0
    };
    sendAPIRequest(historyRequest).catch(e => console.error("Market Data Error:", e));

    tradeMessageContainer.textContent = `Loading data for ${symbol}...`;
}

/**
 * Fetches historical tick data for a symbol to build full digit distribution
 * @param {string} symbol - The symbol to fetch tick history for
 * @param {number} count - Number of historical ticks to fetch (default 1000)
 */
async function fetchTickHistory(symbol, count = 1000) {
    console.log(`📊 Fetching ${count} historical ticks for ${symbol}...`);

    // 1. First, try to fetch from the Ghost Recorder Backend (Instant Data)
    try {
        const backendUrl = `http://localhost:3000/api/market/${symbol}?lookback=${count}`;
        console.log(`📡 Attempting instant backend fetch: ${backendUrl}`);

        const response = await fetch(backendUrl);
        if (response.ok) {
            const data = await response.json();
            if (data && data.history && Array.isArray(data.history)) {
                console.log(`✅ Instant Backend Success! Fetched ${data.history.length} ticks for ${symbol}`);

                // Populate global tick cache
                marketFullTickDigits[symbol] = data.history.map(t => typeof t === 'object' ? t.digit : t);

                // Update UI immediately
                updateDigitAnalysisDisplay(symbol);
                return; // Goal achieved!
            }
        }
    } catch (e) {
        console.warn(`⚠️ Ghost Recorder backend offline or error (Fall-back to Deriv):`, e.message);
    }

    // 2. Fallback to Deriv API (Slower manual fetching)
    const tickHistoryRequest = {
        "ticks_history": symbol,
        "end": "latest",
        "count": count,
        "style": "ticks"
    };

    sendAPIRequest(tickHistoryRequest)
        .then(() => {
            console.log(`✅ Historical tick request sent via Deriv for ${symbol}`);
        })
        .catch(error => {
            console.error(`❌ Failed to fetch tick history for ${symbol}:`, error);
        });
}

function handleMarketChange() {
    const newSymbol = marketSelector.value;
    requestMarketData(newSymbol);
    updateDigitAnalysisDisplay(newSymbol);
}

/**
 * Handles distribution market selector change
 */
function handleDistributionMarketChange() {
    const distributionMarketSelector = document.getElementById('distributionMarketSelector');
    if (distributionMarketSelector) {
        const selectedSymbol = distributionMarketSelector.value;
        updateDigitAnalysisDisplay(selectedSymbol);
    }
}

/**
 * Refreshes the distribution data by fetching new 100 ticks
 */
function refreshDistributionData() {
    const distributionMarketSelector = document.getElementById('distributionMarketSelector');
    if (!distributionMarketSelector) return;

    const selectedSymbol = distributionMarketSelector.value;

    // Show loading state
    const skeleton = document.getElementById('digitAnalysisSkeleton');
    const content = document.getElementById('multiMarketDashboard');
    if (skeleton && content) {
        skeleton.style.display = 'block';
        content.style.display = 'none';
    }

    // Fetch fresh ticks based on custom lookback count
    console.log(`🔄 Refreshing distribution data for ${selectedSymbol} (${distributionLookbackCount} ticks)...`);
    fetchTickHistory(selectedSymbol, distributionLookbackCount);

    // Show toast notification
    if (typeof showToast === 'function') {
        showToast(`Refreshing ${selectedSymbol} distribution data...`, 'info');
    }
}

/**
 * Updates the last digit indicator (red dot) for the current market
 * @param {string} symbol - The symbol to update indicator for
 * @param {number} lastDigit - The last digit from the latest tick
 */
function updateLastDigitIndicator(symbol, lastDigit) {
    // Check which market is selected for distribution display
    const distributionMarketSelector = document.getElementById('distributionMarketSelector');
    const selectedDistributionMarket = distributionMarketSelector ? distributionMarketSelector.value : null;

    // Only update if this is the currently selected distribution market
    if (selectedDistributionMarket && selectedDistributionMarket !== symbol) {
        return;
    }

    // Remove active class from all indicators
    for (let i = 0; i <= 9; i++) {
        const indicator = document.getElementById(`lastDigitIndicator${i}`);
        if (indicator) {
            indicator.classList.remove('active');
        }
    }

    // Add active class to the current digit's indicator
    const currentIndicator = document.getElementById(`lastDigitIndicator${lastDigit}`);
    if (currentIndicator) {
        currentIndicator.classList.add('active');
    }
}

/**
 * Sends a buy request to the Deriv API.
 * @param {string} action - 'CALL' for Up or 'PUT' for Down.
 */
function sendPurchaseRequest(action) {
    const symbol = marketSelector.value;
    const stake = parseFloat(stakeInput.value);
    const duration = parseInt(durationInput.value);

    // Validation
    if (!symbol) {
        showToast("Please select a market", 'warning');
        return;
    }

    if (isNaN(stake) || stake < 0.35) {
        showToast("Minimum stake is 0.35 USD", 'warning');
        stakeInput.focus();
        return;
    }

    if (isNaN(duration) || duration < 1) {
        showToast("Minimum duration is 1 tick", 'warning');
        durationInput.focus();
        return;
    }

    // Disable buttons to prevent double-submission
    buyButtonUp.disabled = true;
    buyButtonDown.disabled = true;

    const actionText = action === 'CALL' ? 'UP' : 'DOWN';
    tradeMessageContainer.innerHTML = `
        <svg class="message-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>Placing ${actionText} trade on ${symbol}...</span>
    `;

    const purchaseRequest = {
        "buy": 1,
        "price": stake,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": (action === 'CALL' ? "CALL" : "PUT"),
            "currency": "USD",
            "duration": duration,
            "duration_unit": "t",
            "symbol": symbol,
        }
    };

    sendAPIRequest(purchaseRequest)
        .catch(error => {
            buyButtonUp.disabled = false;
            buyButtonDown.disabled = false;
            showToast("Failed to place trade", 'error');
        });
}

// ----------------------------------------------------
// 2. Authorization and Primary Flow
// ----------------------------------------------------

function authorizeAndProceed(apiToken) {
    console.log('📤 Sending authorization request to Deriv API...');
    const authRequest = {
        "authorize": apiToken,
        "passthrough": { "purpose": "initial_login" }
    };

    sendAPIRequest(authRequest)
        .then(() => {
            console.log('✅ Authorization request sent successfully');
        })
        .catch(error => {
            console.error('❌ Failed to send authorization request:', error);
            setButtonLoading(loginButton, false);
            showToast('Failed to send authorization request. Please try again.', 'error');
            statusMessage.textContent = "Authorization failed. Please try again.";
        });
}

function handleLogin() {
    console.log('🔑 API Token login initiated');
    const apiToken = apiTokenInput.value.trim();

    if (!apiToken) {
        console.error('❌ No API token provided');
        statusMessage.textContent = "⚠️ Please enter a valid API Token.";
        showToast("API Token is required", 'warning');
        apiTokenInput.focus();
        return;
    }

    // Validate token format (basic check)
    if (apiToken.length < 10) {
        console.error('❌ API token too short:', apiToken.length, 'characters');
        statusMessage.textContent = "⚠️ Invalid API Token format.";
        showToast("API Token appears to be invalid", 'error');
        return;
    }

    console.log('✅ API token validated, length:', apiToken.length);

    // Save the API token for session persistence
    localStorage.setItem('deriv_token', apiToken);
    localStorage.setItem('deriv_account_type', 'demo'); // Assume demo for manual login
    console.log('✅ Token saved to localStorage');

    setButtonLoading(loginButton, true);
    statusMessage.textContent = "Authorizing your account...";

    if (connection && connection.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket already open, authorizing...');
        authorizeAndProceed(apiToken);
    } else {
        console.log('🔄 WebSocket not open, connecting first...');
        connectToDeriv();
        let connectionCheckAttempts = 0;
        const maxAttempts = 100; // 10 seconds (100 * 100ms)

        const checkConnection = setInterval(() => {
            connectionCheckAttempts++;
            if (connection && connection.readyState === WebSocket.OPEN) {
                console.log('✅ WebSocket connected after', connectionCheckAttempts * 100, 'ms');
                clearInterval(checkConnection);
                authorizeAndProceed(apiToken);
            } else if (connectionCheckAttempts >= maxAttempts) {
                console.error('❌ Connection timeout after', maxAttempts * 100, 'ms');
                clearInterval(checkConnection);
                setButtonLoading(loginButton, false);
                showToast("Connection timeout. Please try again.", 'error');
                statusMessage.textContent = "Connection failed. Please check your internet and try again.";
            }
        }, 100);
    }
}

// ----------------------------------------------------
// 3. Symbol Population
// ----------------------------------------------------

function populateMarketSelector() {
    marketSelector.innerHTML = '';
    console.log('📊 Populating market selector with symbols...');

    const volatilitySymbols = activeSymbols
        .filter(symbol => symbol.market === 'synthetic_index' || isAllowedBotMarket(symbol.symbol))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

    console.log(`📊 Found ${volatilitySymbols.length} symbols for market selector`);

    volatilitySymbols.forEach(symbolData => {
        const option = document.createElement('option');
        option.value = symbolData.symbol;

        // Better display names for various indices (matching ticker table logic)
        let displayName = symbolData.symbol;
        const symbol = symbolData.symbol;

        // Volatility Indices
        if (symbol.startsWith('R_')) displayName = symbol.replace('R_', 'Vol ');
        else if (symbol.startsWith('1HZ')) displayName = symbol.replace('1HZ', 'Vol ').replace('V', '');

        // Jump Indices
        else if (symbol.startsWith('JD')) displayName = symbol.replace('JD', 'Jump ');

        // Crash/Boom
        else if (symbol.includes('CRASH')) displayName = symbol.replace('CRASH', 'Crash ');
        else if (symbol.includes('BOOM')) displayName = symbol.replace('BOOM', 'Boom ');

        // Range Break
        else if (symbol.includes('RDBEAR')) displayName = 'Bear Break';
        else if (symbol.includes('RDBULL')) displayName = 'Bull Break';

        // Step Indices
        else if (symbol === 'STPIDX') displayName = 'Step Index';

        // DEX Indices
        else if (symbol.startsWith('DEX')) displayName = symbol.replace('DEX', 'DEX ').replace('DN', ' Down').replace('UP', ' Up');

        // Drift Switching
        else if (symbol.startsWith('DRIFT')) displayName = symbol.replace('DRIFT', 'Drift ');

        // Add (1s) suffix for 1-second indices
        if (symbol.startsWith('1HZ') || symbol.includes('1s')) {
            displayName += ' (1s)';
        }

        option.textContent = `${displayName} (${symbolData.display_name})`;
        marketSelector.appendChild(option);
    });

    // Ensure the default market is selected
    if (marketSelector.querySelector(`option[value="${CHART_MARKET}"]`)) {
        marketSelector.value = CHART_MARKET;
    } else if (volatilitySymbols.length > 0) {
        CHART_MARKET = volatilitySymbols[0].symbol;
        marketSelector.value = CHART_MARKET;
    }

    console.log('📊 Market selector populated with options:', marketSelector.options.length);

    // Initialize digit analysis display for the default market
    updateDigitAnalysisDisplay(CHART_MARKET);
}

/**
 * Updates the digit analysis display for the selected market
 * @param {string} symbol - The symbol to display digit analysis for
 */
function updateDigitAnalysisDisplay(symbol) {
    const skeleton = document.getElementById('digitAnalysisSkeleton');
    const dashboard = document.getElementById('multiMarketDashboard');

    // 1. Initial State Handling
    if (skeleton && (!dashboard || dashboard.children.length === 0)) {
        skeleton.style.display = 'block';
        if (dashboard) dashboard.style.display = 'none';
    }

    // 2. Get Distribution Data
    const distribution = calculateFullDigitDistribution(symbol);
    if (!distribution) return;

    // 3. Update UI
    if (skeleton && dashboard && dashboard.style.display === 'none') {
        skeleton.style.display = 'none';
        dashboard.style.display = 'flex';
    }

    const row = document.getElementById(`market-row-${symbol}`);
    if (!row) return;

    // Calculate averages and identifying Hot/Cold
    const avg = distribution.totalTicks / 10;
    const sortedDigits = Object.entries(distribution.counts)
        .map(([digit, count]) => ({ digit: parseInt(digit), count }))
        .sort((a, b) => b.count - a.count);

    // Update each gauge
    for (let d = 0; d <= 9; d++) {
        const count = distribution.counts[d];
        const percentage = (count / distribution.totalTicks) * 100;

        const path = document.getElementById(`gauge-path-${symbol}-${d}`);
        const valText = document.getElementById(`gauge-val-${symbol}-${d}`);

        if (path && valText) {
            // SVG Circular Arc (Circumference ~ 100.5 for r=16)
            const circumference = 100.5;
            const offset = circumference - (percentage / 100) * circumference;
            path.style.strokeDasharray = `${circumference - offset} ${circumference}`;

            valText.textContent = `${percentage.toFixed(1)}%`;

            // Reset classes
            path.classList.remove('hot', 'cold');
            const container = document.getElementById(`gauge-container-${symbol}-${d}`);
            if (container) container.classList.remove('is-hot', 'is-cold');

            // Ranking-based coloring
            const rank = sortedDigits.findIndex(item => item.digit === d);
            if (rank === 0) {
                path.classList.add('hot');
                if (container) container.classList.add('is-hot');
            } else if (rank === 9) {
                path.classList.add('cold');
                if (container) container.classList.add('is-cold');
            }
        }
    }
}

// ===================================
// AI STRATEGY EXECUTION BRIDGE
// ===================================

/**
 * Global AI Strategy Trade Execution Bridge
 * Called by AIStrategyRunner to execute trades from generated strategies
 * @param {string} type - Contract type (CALL, PUT, DIGITOVER, DIGITUNDER, etc.)
 * @param {number} stake - Suggested stake from strategy (overridden by manual settings)
 * @param {string} symbol - Market symbol
 * @param {number} barrier - Optional barrier for digit predictions
 */
window.executeAIStratTrade = function (type, stake, symbol, barrier = null) {
    // Validate inputs
    if (!type || !symbol) {
        console.error('❌ Invalid trade parameters', { type, symbol });
        if (window.aiStrategyRunner) {
            window.aiStrategyRunner.log('Error: Invalid trade parameters', 'error');
        }
        return;
    }

    // --- MANUAL STAKE & MARTINGALE LOGIC ---
    // Ignore the 'stake' from the AI strategy and use manual configuration
    const stakeInput = document.getElementById('ai-stake-input');
    const martingaleInput = document.getElementById('ai-martingale-input');

    let actualStake = 0.35; // Fallback default

    if (stakeInput && martingaleInput) {
        const baseStake = parseFloat(stakeInput.value) || 0.35;
        // Use the tracked current stake from state
        actualStake = window.aiTradingState.currentStake || baseStake;

        // Ensure strictly no less than base stake (safety)
        if (actualStake < baseStake) actualStake = baseStake;
    } else {
        actualStake = parseFloat(stake) || 0.35; // Fallback to strategy stake if inputs missing
    }

    // Round to 2 decimals
    actualStake = Math.round(actualStake * 100) / 100;
    // ---------------------------------------

    // Default parameters for AI trades
    const duration = 1;
    const duration_unit = 't';

    const purchaseRequest = {
        "buy": 1,
        "price": actualStake,
        "parameters": {
            "amount": actualStake,
            "basis": "stake",
            "contract_type": type, // 'CALL', 'PUT', 'DIGITOVER', etc.
            "currency": "USD",
            "duration": duration,
            "duration_unit": duration_unit,
            "symbol": symbol,
        },
        "passthrough": {
            "purpose": "ai_strategy_trade",
            "timestamp": Date.now()
        }
    };

    // Add barrier if present (for Digit strategies)
    if (barrier !== null && barrier !== undefined) {
        purchaseRequest.parameters.barrier = String(barrier);
    }

    if (typeof sendAPIRequest === 'function') {
        // Log intent
        if (window.aiStrategyRunner) {
            let logMsg = `Placing trade: ${type} ${symbol} $${actualStake} (${duration}${duration_unit})`;
            if (barrier !== null) logMsg += ` [Barrier: ${barrier}]`;
            window.aiStrategyRunner.log(logMsg, 'info');
        }

        sendAPIRequest(purchaseRequest).catch(error => {
            console.error('❌ AI Trade Error:', error);
            // Add error logging to UI
            if (window.aiStrategyRunner) {
                window.aiStrategyRunner.log(`Trade API Error: ${error.message || error}`, 'error');
            }
            // Also show toast to user
            if (typeof showToast === 'function') {
                showToast(`AI Trade Failed: ${error.message || 'Unknown error'}`, 'error');
            }
        });
    } else {
        console.error('❌ sendAPIRequest not found! Cannot execute trade.');
        if (window.aiStrategyRunner) {
            window.aiStrategyRunner.log('System Error: sendAPIRequest function missing', 'error');
        }
    }
};
