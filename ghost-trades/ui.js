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
    
    // Check if account type changed
    const previousAccountType = localStorage.getItem('deriv_account_type');
    const accountTypeChanged = previousAccountType && previousAccountType !== accountType;
    
    // Store account information in localStorage
    localStorage.setItem('deriv_login_id', loginId);
    localStorage.setItem('deriv_account_type', accountType);
    localStorage.setItem('deriv_balance', balance);
    localStorage.setItem('deriv_currency', currency);

    // Update displays
    if (typeof loginIdDisplay !== 'undefined') {
        loginIdDisplay.textContent = loginId;
    }
    
    // Update account badge
    updateAccountBadge(accountType);
    
    // If switched to real account, show confirmation
    if (accountTypeChanged && accountType === 'real') {
        showRealAccountSwitchConfirmation();
    }

    // Hide login container - use direct DOM manipulation for reliability
    const loginInterface = document.querySelector('.auth-container');
    if (loginInterface) {
        loginInterface.style.display = 'none';
        console.log('✅ Auth container hidden after authorization');
    }

    // Show dashboard - use both direct DOM and showSection for reliability
    const dashboardElement = document.getElementById('dashboard');
    if (dashboardElement) {
        dashboardElement.style.display = 'flex';
        console.log('✅ Dashboard shown after authorization');
    }
    
    // Also use showSection if available for proper navigation state
    if (typeof showSection === 'function') {
        showSection('dashboard');
    } else {
        console.warn('⚠️ showSection() not available in updateAuthUI, using direct DOM manipulation');
        // Manually update nav active state
        const dashboardNav = document.getElementById('dashboard-nav');
        if (dashboardNav) {
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            dashboardNav.classList.add('active');
        }
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
 * Update account badge
 * @param {string} accountType - 'demo' or 'real'
 */
function updateAccountBadge(accountType) {
    const badge = document.getElementById('accountTypeBadge');
    if (!badge) return;
    
    badge.style.display = 'inline-block';
    badge.className = `account-badge ${accountType}`;
    
    if (accountType === 'real') {
        badge.textContent = '⚠️ REAL';
        badge.title = 'Trading with real money';
    } else {
        badge.textContent = '✓ DEMO';
        badge.title = 'Practice account';
    }
}

/**
 * Show confirmation when switching to real account
 */
function showRealAccountSwitchConfirmation() {
    // Stop all running bots first
    let botsStopped = 0;
    
    if (typeof isBotRunning !== 'undefined' && isBotRunning) {
        if (typeof stopGhostAiBot === 'function') {
            stopGhostAiBot();
            botsStopped++;
        }
    }
    
    if (typeof evenOddBotState !== 'undefined' && evenOddBotState.isTrading) {
        if (typeof stopEvenOddBot === 'function') {
            stopEvenOddBot();
            botsStopped++;
        }
    }
    
    if (window.aiStrategyRunner && window.aiStrategyRunner.isActive) {
        if (typeof window.aiStrategyRunner.stop === 'function') {
            window.aiStrategyRunner.stop();
            botsStopped++;
        }
    }
    
    // Show warning modal
    const confirmed = confirm(
        `⚠️ REAL ACCOUNT ACTIVATED ⚠️\n\n` +
        `You have switched to a REAL account.\n` +
        `All trades will use REAL MONEY.\n\n` +
        (botsStopped > 0 ? `${botsStopped} bot(s) have been stopped for safety.\n\n` : '') +
        `Please confirm you understand the risks.`
    );
    
    if (confirmed && typeof showToast === 'function') {
        showToast('⚠️ REAL ACCOUNT ACTIVE - Trade carefully!', 'error', 5000);
    }
}

/**
 * Confirm before starting bot on real account (simplified - no double confirmation)
 * @param {string} botName - Name of the bot
 * @returns {boolean} - True if confirmed, false if cancelled
 */
function confirmRealAccountBotStart(botName) {
    const accountType = localStorage.getItem('deriv_account_type');
    
    if (accountType !== 'real') {
        return true; // No confirmation needed for demo
    }
    
    // Single confirmation on bot start
    const confirmed = confirm(
        `⚠️ REAL ACCOUNT ACTIVE ⚠️\n\n` +
        `${botName} will trade with REAL MONEY.\n\n` +
        `Continue?`
    );
    
    if (!confirmed) {
        if (typeof showToast === 'function') {
            showToast(`${botName} start cancelled`, 'warning', 3000);
        }
        return false;
    }
    
    console.log(`⚠️ Starting ${botName} on REAL account`);
    return true;
}

/**
 * Tutorial Functions
 */
function openTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// Tutorial tab switching
document.addEventListener('DOMContentLoaded', () => {
    const tutorialTabs = document.querySelectorAll('.tutorial-tab');
    const tutorialContents = document.querySelectorAll('.tutorial-tab-content');
    
    tutorialTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Remove active class from all tabs and contents
            tutorialTabs.forEach(t => t.classList.remove('active'));
            tutorialContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const targetContent = document.querySelector(`[data-content="${targetTab}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
    
    // Close tutorial on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTutorial();
        }
    });
    
    // Close tutorial on backdrop click
    const tutorialModal = document.getElementById('tutorial-modal');
    if (tutorialModal) {
        tutorialModal.addEventListener('click', (e) => {
            if (e.target === tutorialModal) {
                closeTutorial();
            }
        });
    }
});

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
