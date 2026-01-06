// ===================================
// UI UPDATE LOGIC
// ===================================

/**
 * Update UI after successful authorization
 * @param {object} data - The authorize response data
 */
function updateAuthUI(data) {
    const loginId = data.authorize.loginid;
    const balance = data.authorize.balance;
    const currency = data.authorize.currency;

    // CRITICAL: Determine account type
    const accountType = loginId.startsWith('VRT') || loginId.startsWith('VRTC') ? 'demo' : 'real';
    
    // Store account information in localStorage
    localStorage.setItem('deriv_login_id', loginId);
    localStorage.setItem('deriv_account_type', accountType);
    localStorage.setItem('deriv_balance', balance);
    localStorage.setItem('deriv_currency', currency);

    // Update displays
    if (typeof loginIdDisplay !== 'undefined') {
        loginIdDisplay.textContent = loginId;
        
        // Visual indicator for real accounts
        if (accountType === 'real') {
            loginIdDisplay.style.color = '#ff6b6b';
            loginIdDisplay.style.fontWeight = 'bold';
            loginIdDisplay.style.textShadow = '0 0 10px rgba(255, 107, 107, 0.5)';
        } else {
            loginIdDisplay.style.color = '';
            loginIdDisplay.style.fontWeight = '';
            loginIdDisplay.style.textShadow = '';
        }
    }

    // Show/hide real account warning banner
    if (accountType === 'real') {
        showRealAccountWarning();
    } else {
        hideRealAccountWarning();
    }

    // Hide login container
    const loginInterface = document.querySelector('.auth-container');
    if (loginInterface) {
        loginInterface.style.display = 'none';
    }

    // Show dashboard
    if (typeof showSection === 'function') {
        showSection('dashboard');
    }

    // Update connection status
    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus('connected');
    }

    // Reset buttons
    const loginButton = document.getElementById('loginButton');
    if (loginButton && typeof setButtonLoading === 'function') {
        setButtonLoading(loginButton, false);
    }
    
    console.log(`✅ Account type: ${accountType.toUpperCase()}`);
}

/**
 * Show real account warning banner
 */
function showRealAccountWarning() {
    let banner = document.getElementById('real-account-warning');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'real-account-warning';
        banner.style.cssText = `
            position: fixed; 
            top: 0; 
            left: 0; 
            right: 0; 
            background: linear-gradient(135deg, #ff6b6b 0%, #ff4444 100%); 
            color: white; 
            padding: 12px; 
            text-align: center; 
            font-weight: bold; 
            z-index: 99999;
            box-shadow: 0 2px 10px rgba(255, 107, 107, 0.5);
            animation: pulse 2s infinite;
        `;
        banner.innerHTML = '⚠️ REAL ACCOUNT ACTIVE - You are trading with REAL money! ⚠️';
        document.body.prepend(banner);
        
        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Hide real account warning banner
 */
function hideRealAccountWarning() {
    const banner = document.getElementById('real-account-warning');
    if (banner) {
        banner.remove();
    }
}

/**
 * Confirm before starting bot on real account
 * @param {string} botName - Name of the bot
 * @returns {boolean} - True if confirmed, false if cancelled
 */
function confirmRealAccountBotStart(botName) {
    const accountType = localStorage.getItem('deriv_account_type');
    
    if (accountType !== 'real') {
        return true; // No confirmation needed for demo
    }
    
    // First confirmation
    const confirmed = confirm(
        `⚠️ REAL ACCOUNT WARNING ⚠️\n\n` +
        `You are about to start ${botName} on a REAL account.\n` +
        `Real money will be used for trades.\n\n` +
        `Are you absolutely sure you want to continue?`
    );
    
    if (!confirmed) {
        if (typeof showToast === 'function') {
            showToast(`${botName} start cancelled (Real Account Safety)`, 'warning', 5000);
        }
        return false;
    }
    
    // Second confirmation
    const doubleConfirmed = confirm(
        `⚠️ FINAL CONFIRMATION ⚠️\n\n` +
        `This is your LAST CHANCE to cancel.\n` +
        `${botName} will start trading with REAL MONEY.\n\n` +
        `Click OK to confirm, or Cancel to abort.`
    );
    
    if (!doubleConfirmed) {
        if (typeof showToast === 'function') {
            showToast(`${botName} start cancelled (Final Confirmation)`, 'warning', 5000);
        }
        return false;
    }
    
    console.log(`⚠️ USER CONFIRMED: Starting ${botName} on REAL account`);
    if (typeof showToast === 'function') {
        showToast(`⚠️ ${botName} started on REAL account!`, 'error', 5000);
    }
    
    return true;
}

/**
 * Update Balance Display
 * @param {string|number} balance - Account balance
 * @param {string} currency - Account currency
 */
function updateBalanceUI(balance, currency) {
    const formattedBalance = parseFloat(balance).toFixed(2);
    const accountType = localStorage.getItem('deriv_account_type');

    // Main Dashboard Balance
    const balanceDisplay = document.getElementById('balanceDisplay');
    if (balanceDisplay) {
        if (typeof formatCurrency === 'function') {
            balanceDisplay.textContent = formatCurrency(formattedBalance, currency);
        } else {
            balanceDisplay.textContent = `${formattedBalance} ${currency}`;
        }
        
        // Visual indicator for real accounts
        if (accountType === 'real') {
            balanceDisplay.style.color = '#ff6b6b';
            balanceDisplay.style.fontWeight = 'bold';
        } else {
            balanceDisplay.style.color = '';
            balanceDisplay.style.fontWeight = '';
        }
    }

    // Header Balance
    const headerBalance = document.getElementById('headerBalance');
    const headerBalanceAmount = document.getElementById('headerBalanceAmount');

    if (headerBalance && headerBalanceAmount) {
        headerBalance.style.display = 'flex';
        if (typeof formatCurrency === 'function') {
            headerBalanceAmount.textContent = formatCurrency(formattedBalance, currency);
        } else {
            headerBalanceAmount.textContent = `${formattedBalance} ${currency}`;
        }
        
        // Visual indicator for real accounts
        if (accountType === 'real') {
            headerBalanceAmount.style.color = '#ff6b6b';
            headerBalanceAmount.style.fontWeight = 'bold';
        } else {
            headerBalanceAmount.style.color = '';
            headerBalanceAmount.style.fontWeight = '';
        }
    }

    // Show logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.style.display = 'flex';
    }
    
    // Update localStorage
    localStorage.setItem('deriv_balance', balance);
    localStorage.setItem('deriv_currency', currency);
}

/**
 * Update Ticker Watch Table Row
 * @param {string} symbol - Market symbol
 * @param {number} price - Current price
 * @param {number} lastPrice - Previous price
 */
function updateTickerUI(symbol, price, lastPrice) {
    // Check if row exists
    const row = document.getElementById(`row-${symbol}`);
    if (!row) return;

    const priceCell = row.cells[1];
    const changeCell = row.cells[2];

    // Calculate change
    if (lastPrice) {
        priceCell.classList.remove('price-up', 'price-down');

        if (price > lastPrice) {
            priceCell.classList.add('price-up');
            row.style.backgroundColor = '#e6ffe6'; // Light green flash
        } else if (price < lastPrice) {
            priceCell.classList.add('price-down');
            row.style.backgroundColor = '#ffe6e6'; // Light red flash
        }

        const percentageChange = ((price - lastPrice) / lastPrice) * 100;
        changeCell.textContent = `${percentageChange.toFixed(2)}%`;

        // Remove flash effect
        setTimeout(() => {
            row.style.backgroundColor = '';
        }, 500);
    }

    priceCell.textContent = price.toFixed(5);
}

/**
 * Update Trading Message / Status
 * @param {string} htmlContent - HTML content to display
 */
function updateTradeMessageUI(htmlContent) {
    if (typeof tradeMessageContainer !== 'undefined') {
        tradeMessageContainer.innerHTML = htmlContent;
    }
}

/**
 * Update Ghost AI Button States (All 3 buttons)
 * @param {boolean} isRunning - Whether the bot is running
 */
function updateGhostAIButtonStates(isRunning) {
    const buttons = [
        document.getElementById('ghost-ai-toggle-button'),
        document.getElementById('ghost-ai-toggle-button-bottom'),
        document.getElementById('ghost-ai-toggle-button-history')
    ];

    buttons.forEach(button => {
        if (button) {
            if (isRunning) {
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="6" y="6" width="12" height="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Stop Bot</span>
                `;
                button.classList.remove('btn-start', 'primary-button');
                button.classList.add('btn-stop', 'stop-button');
            } else {
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="5 3 19 12 5 21 5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Start Bot</span>
                `;
                button.classList.remove('btn-stop', 'stop-button');
                button.classList.add('btn-start', 'primary-button');
            }
        }
    });
}
