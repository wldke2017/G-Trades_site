// ===================================
// ACCOUNT SWITCHER - DERIV STYLE UI
// ===================================

/**
 * Initialize the account switcher UI
 */
function initAccountSwitcher() {
    const container = document.getElementById('accountSwitcherContainer');
    const header = document.getElementById('accountDropdownToggle');
    const menu = document.getElementById('accountDropdownMenu');

    if (!container || !header || !menu) {
        console.warn('Account switcher elements not found');
        return;
    }

    // Toggle dropdown on header click
    header.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAccountDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            closeAccountDropdown();
        }
    });

    // Prevent dropdown from closing when clicking inside
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Setup action buttons
    setupAccountSwitcherActions();
}

/**
 * Toggle account dropdown visibility
 */
function toggleAccountDropdown() {
    const header = document.getElementById('accountDropdownToggle');
    const menu = document.getElementById('accountDropdownMenu');

    if (!header || !menu) return;

    const isOpen = menu.classList.contains('open');

    if (isOpen) {
        closeAccountDropdown();
    } else {
        openAccountDropdown();
    }
}

/**
 * Open account dropdown
 */
function openAccountDropdown() {
    const header = document.getElementById('accountDropdownToggle');
    const menu = document.getElementById('accountDropdownMenu');

    if (!header || !menu) return;

    header.classList.add('open');
    menu.classList.add('open');
}

/**
 * Close account dropdown
 */
function closeAccountDropdown() {
    const header = document.getElementById('accountDropdownToggle');
    const menu = document.getElementById('accountDropdownMenu');

    if (!header || !menu) return;

    header.classList.remove('open');
    menu.classList.remove('open');
}

/**
 * Populate account switcher with accounts
 * @param {Array} accounts - Array of account objects
 */
function populateAccountSwitcherUI(accounts) {
    // If no accounts provided, try to load from storage
    if (!accounts || accounts.length === 0) {
        const storedAccounts = localStorage.getItem('deriv_all_accounts');
        if (storedAccounts) {
            try {
                accounts = JSON.parse(storedAccounts);
                console.log('📦 Loaded accounts from localStorage:', accounts.length);
            } catch (e) {
                console.error('Failed to parse stored accounts', e);
                return;
            }
        } else {
            return; // No accounts to show
        }
    }

    const accountList = document.getElementById('accountList');
    const container = document.getElementById('accountSwitcherContainer');

    if (!accountList || !container) {
        console.error('Account list element not found');
        return;
    }

    // Clear existing accounts
    accountList.innerHTML = '';

    // Get current active account
    const currentAccountId = localStorage.getItem('deriv_account_id');

    // Render each account
    accounts.forEach(acc => {
        const isActive = acc.id === currentAccountId;
        const accountItem = createAccountItem(acc, isActive);
        accountList.appendChild(accountItem);
    });

    // Show the container
    container.classList.add('visible');

    // Update header with current account info
    updateAccountHeader();

    console.log('✅ Account switcher UI populated with', accounts.length, 'account(s)');
}

/**
 * Create account item element
 * @param {Object} account - Account object
 * @param {Boolean} isActive - Whether this is the active account
 * @returns {HTMLElement}
 */
function createAccountItem(account, isActive) {
    const item = document.createElement('div');
    item.className = `account-item ${isActive ? 'active' : ''}`;
    item.dataset.accountId = account.id;
    item.dataset.token = account.token;

    // Determine account type
    const isDemo = account.id.startsWith('VRT') || account.id.startsWith('VRTC');
    const accountType = isDemo ? 'demo' : 'real';

    item.innerHTML = `
        <div class="account-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="account-details">
            <div class="account-id">${account.id}</div>
            <div class="account-meta">
                <span class="account-type-badge ${accountType}">${accountType}</span>
                <span>${account.currency || 'USD'}</span>
            </div>
        </div>
        <svg class="checkmark" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;

    // Add click handler
    item.addEventListener('click', () => {
        handleAccountSelection(account.token, account.id);
    });

    return item;
}

/**
 * Handle account selection
 * @param {String} token - Account token
 * @param {String} accountId - Account ID
 */
function handleAccountSelection(token, accountId) {
    // Use existing switchAccount function
    if (typeof switchAccount === 'function') {
        switchAccount(token, accountId);
        closeAccountDropdown();
    } else {
        console.error('switchAccount function not found');
    }
}

/**
 * Update account header with current account info
 */
function updateAccountHeader() {
    const accountTypeLabel = document.getElementById('accountTypeLabel');
    const accountBalance = document.getElementById('accountBalance');

    if (!accountTypeLabel || !accountBalance) return;

    // Get current account info from localStorage
    const accountType = localStorage.getItem('deriv_account_type') || 'demo';
    const balance = localStorage.getItem('deriv_balance') || '0.00';
    const currency = localStorage.getItem('deriv_currency') || 'USD';

    // Update label
    accountTypeLabel.textContent = `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} account`;

    // Update balance
    accountBalance.textContent = `${parseFloat(balance).toFixed(2)} ${currency}`;

    // Update color based on account type
    if (accountType === 'real') {
        accountBalance.style.color = 'var(--error-color)';
    } else {
        accountBalance.style.color = 'var(--text-primary)';
    }
}

/**
 * Setup action button handlers
 */
function setupAccountSwitcherActions() {
    // Help link - Account not showing
    const helpItem = document.getElementById('accountNotShowingHelp');
    if (helpItem) {
        helpItem.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://app.deriv.com/account', '_blank');
            closeAccountDropdown();
        });
    }

    // Refresh demo account
    const refreshDemo = document.getElementById('refreshDemoAccount');
    if (refreshDemo) {
        refreshDemo.addEventListener('click', () => {
            handleRefreshDemoAccount();
        });
    }

    // Hide details toggle
    const hideDetails = document.getElementById('hideDetailsToggle');
    if (hideDetails) {
        hideDetails.addEventListener('click', () => {
            toggleAccountDetails();
        });
    }

    // Sign out
    const signOut = document.getElementById('signOutBtn');
    if (signOut) {
        signOut.addEventListener('click', () => {
            handleSignOut();
        });
    }
}

/**
 * Refresh demo account balance
 */
function handleRefreshDemoAccount() {
    const accountType = localStorage.getItem('deriv_account_type');

    if (accountType !== 'demo') {
        showToast('Refresh is only available for demo accounts', 'warning');
        return;
    }

    // Call Deriv API to top up virtual account
    if (typeof sendAPIRequest === 'function') {
        sendAPIRequest({ topup_virtual: 1 })
            .then(response => {
                if (response.topup_virtual) {
                    showToast('Demo account refreshed successfully', 'success');
                    // Request updated balance
                    if (typeof requestBalance === 'function') {
                        requestBalance();
                    }
                    updateAccountHeader();
                } else {
                    showToast('Failed to refresh demo account', 'error');
                }
            })
            .catch(error => {
                console.error('Error refreshing demo account:', error);
                showToast('Failed to refresh demo account', 'error');
            });
    }

    closeAccountDropdown();
}

/**
 * Toggle account details visibility
 */
function toggleAccountDetails() {
    const accountList = document.getElementById('accountList');
    const hideDetailsBtn = document.getElementById('hideDetailsToggle');

    if (!accountList || !hideDetailsBtn) return;

    const isHidden = accountList.style.display === 'none';

    if (isHidden) {
        accountList.style.display = 'block';
        hideDetailsBtn.innerHTML = `
            <span class="item-icon">👁️</span>
            <span>Hide Details</span>
        `;
    } else {
        accountList.style.display = 'none';
        hideDetailsBtn.innerHTML = `
            <span class="item-icon">👁️</span>
            <span>Show Details</span>
        `;
    }
}

/**
 * Handle sign out
 */
function handleSignOut() {
    if (confirm('Are you sure you want to sign out?')) {
        // Use existing logout function
        if (typeof logout === 'function') {
            logout();
        } else {
            console.error('logout function not found');
        }
        closeAccountDropdown();
    }
}

/**
 * Update refresh demo button visibility
 */
function updateRefreshDemoVisibility() {
    const refreshDemo = document.getElementById('refreshDemoAccount');
    if (!refreshDemo) return;

    const accountType = localStorage.getItem('deriv_account_type');

    if (accountType === 'demo') {
        refreshDemo.style.display = 'flex';
    } else {
        refreshDemo.style.display = 'none';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccountSwitcher);
} else {
    initAccountSwitcher();
}

// Make functions globally available
window.populateAccountSwitcherUI = populateAccountSwitcherUI;
window.updateAccountHeader = updateAccountHeader;
window.updateRefreshDemoVisibility = updateRefreshDemoVisibility;
window.closeAccountDropdown = closeAccountDropdown;