// ===================================
// WEBSOCKET CONNECTION MANAGEMENT
// ===================================

// Global connection variables
let connection = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let pingInterval = null;

function connectToDeriv() {
    console.log('🔌 connectToDeriv() called, current state:', connection ? connection.readyState : 'no connection');

    // Initialize Visibility API listener (only once)
    if (!window.visibilityListenerAdded) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.visibilityListenerAdded = true;
        console.log('👀 Page Visibility API listener added');
    }

    if (connection && (connection.readyState === WebSocket.OPEN || connection.readyState === WebSocket.CONNECTING)) {
        console.log('✅ Connection already open or connecting, skipping...');
        return;
    }

    try {
        console.log('🔄 Creating new WebSocket connection to:', WS_URL);
        connection = new WebSocket(WS_URL);
        updateConnectionStatus('connecting');
        if (typeof statusMessage !== 'undefined' && statusMessage) {
            statusMessage.textContent = "Establishing connection...";
        }

        connection.onopen = (event) => {
            if (typeof handleConnectionOpen === 'function') handleConnectionOpen(event);
        };
        connection.onmessage = (event) => {
            if (typeof window.handleIncomingMessage === 'function') window.handleIncomingMessage(event);
            else console.warn('⚠️ handleIncomingMessage not yet defined. Message skipped.');
        };
        connection.onerror = (event) => {
            if (typeof handleConnectionError === 'function') handleConnectionError(event);
        };
        connection.onclose = (event) => {
            if (typeof handleConnectionClose === 'function') handleConnectionClose(event);
        };

    } catch (error) {
        console.error("❌ Failed to create WebSocket:", error);
        showToast("Failed to establish connection", 'error');
        updateConnectionStatus('error');
        attemptReconnect();
    }
}

/**
 * Establishes WebSocket connection and sends the authorize request.
 * @param {string} token - The access token from OAuth or localStorage.
 */
function connectAndAuthorize(token) {
    if (!token) {
        showToast("No token provided for authorization", "error");
        return;
    }

    // STRENGTHENED SINGLETON: Prevent duplicate connections (CONNECTING or OPEN)
    if (connection && (connection.readyState === WebSocket.CONNECTING || connection.readyState === WebSocket.OPEN)) {
        console.log('🔄 WebSocket already connecting or connected, reusing existing connection');

        // If already open, just authorize
        if (connection.readyState === WebSocket.OPEN) {
            console.log("🚀 WebSocket already open. Sending Authorization...");
            connection.send(JSON.stringify({ authorize: token }));
        }
        // If CONNECTING, wait for it to open before authorizing
        else {
            console.log("⏳ WebSocket still connecting, will authorize when ready...");
            const originalOnOpen = connection.onopen;
            connection.onopen = (event) => {
                if (originalOnOpen) originalOnOpen(event);
                console.log("🚀 WebSocket now open. Sending Authorization...");
                updateConnectionStatus('connected');
                connection.send(JSON.stringify({ authorize: token }));
            };
        }

        // Ensure handlers are set
        connection.onmessage = (event) => {
            if (typeof window.handleIncomingMessage === 'function') window.handleIncomingMessage(event);
        };
        connection.onerror = handleConnectionError;
        connection.onclose = handleConnectionClose;
        return;
    }

    // Create new connection
    connection = new WebSocket(WS_URL);

    connection.onopen = () => {
        console.log("🚀 WebSocket Open. Sending Authorization...");
        updateConnectionStatus('connected');
        connection.send(JSON.stringify({ authorize: token }));
    };

    // Standard handlers
    connection.onmessage = (event) => {
        if (typeof window.handleIncomingMessage === 'function') window.handleIncomingMessage(event);
    };
    connection.onerror = handleConnectionError;
    connection.onclose = handleConnectionClose;
}

function handleConnectionOpen(event) {
    console.log("✅ WebSocket connection established!");
    updateConnectionStatus('connected');
    statusMessage.textContent = "Connected. Enter your API token to continue.";
    reconnectAttempts = 0;

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    startHeartbeat();

    // NEW: Request active symbols immediately to populate UI even before login
    if (typeof requestActiveSymbols === 'function') {
        console.log('🔄 Requesting active symbols on connection open...');
        requestActiveSymbols();
    }
}

function startHeartbeat() {
    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(() => {
        if (connection && connection.readyState === WebSocket.OPEN) {
            console.log('💓 Heartbeat: Sending ping...');
            connection.send(JSON.stringify({ ping: 1 }));
        }
    }, 30000); // 30 seconds
}

function stopHeartbeat() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('🟢 Page became visible - Checking connection stability...');

        const needsReconnect = !connection ||
            connection.readyState === WebSocket.CLOSED ||
            connection.readyState === WebSocket.CLOSING;

        if (needsReconnect) {
            console.log('⚠️ Connection lost in background. Reconnecting...');
            reconnectAttempts = 0; // Reset for aggressive immediate reconnect
            connectToDeriv();

            // If we have a token, authorize immediately
            const token = localStorage.getItem('deriv_access_token');
            if (token) connectAndAuthorize(token);
        } else {
            // Even if open, send a test ping to ensure the server hasn't ghosted us
            console.log('📝 Connection looks alive, sending test ping...');
            connection.send(JSON.stringify({ ping: 1 }));
        }
    }
}

function handleConnectionError(error) {
    console.error("❌ WebSocket Error:", error);
    console.error("❌ WebSocket Error details:", {
        code: error.code,
        reason: error.reason,
        wasClean: error.wasClean,
        target: error.target,
        type: error.type
    });
    updateConnectionStatus('error');
    showToast("Connection error occurred - Check network/firewall", 'error');

    // Additional diagnostics
    console.log("🔍 Connection diagnostics:");
    console.log("- WebSocket URL:", WS_URL);
    console.log("- Browser:", navigator.userAgent);
    console.log("- Online status:", navigator.onLine);
    console.log("- Protocol:", window.location.protocol);

    // Try to reconnect after a longer delay
    console.log("🔄 Attempting to reconnect in 10 seconds...");
    setTimeout(() => {
        console.log("🔄 Retrying connection...");
        connectToDeriv();
    }, 10000);
}

function handleConnectionClose(event) {
    console.log("🔌 WebSocket connection closed", event.code, event.reason);
    updateConnectionStatus('disconnected');

    stopHeartbeat();

    if (!event.wasClean) {
        showToast("Connection lost. Attempting to reconnect...", 'warning');
        attemptReconnect();
    }
}

function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        showToast("Unable to connect. Please refresh the page.", 'error');
        statusMessage.textContent = "Connection failed. Please refresh the page.";
        return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY * reconnectAttempts;

    statusMessage.textContent = `Reconnecting in ${delay / 1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;

    reconnectTimer = setTimeout(() => {
        console.log(`🔄 Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        connectToDeriv();
    }, delay);
}

function sendAPIRequest(request) {
    return new Promise((resolve, reject) => {
        if (!connection || connection.readyState !== WebSocket.OPEN) {
            console.error("❌ Connection not open. Cannot send request:", request);
            showToast("Connection not available. Reconnecting...", 'warning');
            connectToDeriv();
            reject(new Error("Connection not available"));
            return;
        }

        try {
            connection.send(JSON.stringify(request));
            resolve();
        } catch (error) {
            console.error("❌ Failed to send request:", error);
            showToast("Failed to send request", 'error');
            reject(error);
        }
    });
}

// ===================================
// OAUTH INITIALIZATION
// ===================================

/**
 * Extracts Deriv OAuth tokens from URL hash fragment
 * @returns {Array|null} Array of account objects or null if no tokens found
 */
function getDerivTokensFromURL() {
    let params;

    // Check for hash fragment first (default for some OAuth flows)
    if (window.location.hash) {
        params = new URLSearchParams(window.location.hash.substring(1));
    }
    // Fallback to query parameters (what user is seeing)
    else if (window.location.search) {
        params = new URLSearchParams(window.location.search);
    }

    if (!params) return null;

    const accounts = [];

    // Deriv returns acct1, token1, acct2, token2, etc.
    let i = 1;
    while (params.has(`acct${i}`)) {
        accounts.push({
            account: params.get(`acct${i}`),
            token: params.get(`token${i}`),
            currency: params.get(`cur${i}`)
        });
        i++;
    }

    return accounts.length > 0 ? accounts : null;
}

/**
 * Handles the OAuth 2.0 Authorization Code callback when returning from Deriv OAuth.
 * Validates CSRF state, extracts the authorization code, and exchanges it for an access token.
 */
async function handleOAuthCallback() {
    console.log('🔄 OAuth 2.0 callback detected, processing...');

    const params = new URLSearchParams(window.location.search);

    // Check for errors from Deriv
    const error = params.get('error');
    if (error) {
        console.error('OAuth Error:', error);
        showToast(`OAuth Error: ${error}`, 'error');
        if (typeof statusMessage !== 'undefined' && statusMessage) {
            statusMessage.textContent = "OAuth login failed. Please try again.";
        }
        return;
    }

    // --- STRICT State Validation (CSRF Protection) ---
    const returnedState = params.get('state');
    const savedState = sessionStorage.getItem('deriv_auth_state');

    if (!returnedState || !savedState || returnedState !== savedState) {
        console.error('❌ CSRF State Mismatch Detected! Authentication rejected.');
        showToast('Security validation failed. Please try logging in again.', 'error');
        if (typeof statusMessage !== 'undefined' && statusMessage) {
            statusMessage.textContent = "Security check failed. Please login again.";
        }
        // Clean up
        sessionStorage.removeItem('deriv_auth_state');
        sessionStorage.removeItem('deriv_code_verifier');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // --- Extract Authorization Code ---
    const code = params.get('code');
    if (!code) {
        console.error('❌ No authorization code found in callback URL');
        showToast('Authorization code missing. Please try logging in again.', 'error');
        return;
    }

    console.log('✅ State validated. Exchanging authorization code for access token...');
    if (typeof statusMessage !== 'undefined' && statusMessage) {
        statusMessage.textContent = "Exchanging authorization code...";
    }

    try {
        // Exchange the code for an access token
        const accessToken = await exchangeCodeForToken(code);

        if (!accessToken) {
            throw new Error('Token exchange returned no access token');
        }

        console.log('✅ Access token obtained successfully');

        // Store the access token
        localStorage.setItem('deriv_access_token', accessToken);

        // Update OAuth state
        if (typeof window.oauthState === 'undefined') {
            window.oauthState = {
                access_token: null,
                refresh_token: null,
                account_type: 'demo',
                login_id: null,
                account_id: null
            };
        }
        window.oauthState.access_token = accessToken;

        if (typeof statusMessage !== 'undefined' && statusMessage) {
            statusMessage.textContent = "Loading your account data...";
        }

        // Connect and authorize with the new token
        connectAndAuthorize(accessToken);

        // Show dashboard
        const loginInterface = document.querySelector('.auth-container');
        const dashboardElement = document.getElementById('dashboard');

        if (loginInterface) {
            loginInterface.style.display = 'none';
        }
        if (dashboardElement) {
            dashboardElement.style.display = 'flex';
        }

        if (typeof showSection === 'function') {
            showSection('dashboard');
        }

        // Toggle header buttons
        const headerLoginBtn = document.getElementById('headerLoginBtn');
        const accountSwitcher = document.getElementById('accountSwitcherContainer');
        if (headerLoginBtn) headerLoginBtn.style.display = 'none';
        if (accountSwitcher) accountSwitcher.style.display = 'flex';

    } catch (err) {
        console.error('❌ Token exchange failed:', err);
        showToast(`Login failed: ${err.message}`, 'error');
        if (typeof statusMessage !== 'undefined' && statusMessage) {
            statusMessage.textContent = "Login failed. Please try again.";
        }
    } finally {
        // Clean up: clear tokens from URL and sessionStorage
        window.history.replaceState({}, document.title, window.location.pathname);
        sessionStorage.removeItem('deriv_auth_state');
        sessionStorage.removeItem('deriv_code_verifier');
    }
}


/**
 * Populates the account switcher dropdown with available accounts
 */
function populateAccountSwitcher(accounts) {
    // Use new UI if available, fallback to old implementation
    if (typeof populateAccountSwitcherUI === 'function') {
        populateAccountSwitcherUI(accounts);

        // Also update refresh demo button visibility
        if (typeof updateRefreshDemoVisibility === 'function') {
            updateRefreshDemoVisibility();
        }
        return;
    }

    // Fallback: Old implementation
    console.warn('Using legacy account switcher');

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

    const select = document.getElementById('active-account-select');
    const accountSwitcher = document.getElementById('accountSwitcher');

    if (!select || !accountSwitcher) {
        console.error('Account switcher elements not found');
        return;
    }

    // Clear existing options
    select.innerHTML = '';

    // Add each account as an option
    accounts.forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.token;
        option.dataset.accountId = acc.id;
        option.textContent = `${acc.id} (${acc.currency})`;
        select.appendChild(option);
    });

    // Show the account switcher
    accountSwitcher.style.display = 'flex';

    // Add change event listener
    select.addEventListener('change', (e) => {
        const selectedToken = e.target.value;
        const selectedId = e.target.options[e.target.selectedIndex].dataset.accountId;
        console.log(`🔄 Switching to account: ${selectedId}`);
        switchAccount(selectedToken, selectedId);
    });

    console.log('✅ Account switcher populated with', accounts.length, 'account(s)');
}

/**
 * Switches to a different account using the provided token
 */
function switchAccount(token, accountId) {
    console.log(`🔄 Switching to account: ${accountId}`);

    if (!token || !accountId) {
        console.error('Invalid token or account ID');
        showToast('Invalid account selection', 'error');
        return;
    }

    // Update OAuth state
    if (typeof window.oauthState === 'undefined') {
        window.oauthState = {
            access_token: null,
            refresh_token: null,
            account_type: accountId.startsWith('VRTC') ? 'demo' : 'real',
            login_id: null,
            account_id: null
        };
    }

    window.oauthState.access_token = token;
    window.oauthState.account_id = accountId;
    window.oauthState.account_type = accountId.startsWith('VRTC') ? 'demo' : 'real';

    // Save to localStorage
    localStorage.setItem('deriv_access_token', token);
    localStorage.setItem('deriv_account_id', accountId);
    localStorage.setItem('deriv_account_type', window.oauthState.account_type);

    console.log('✅ Account switched to:', accountId, `(${window.oauthState.account_type})`);

    // 🔥 ROBUST FIX: Show the dashboard immediately using direct DOM manipulation
    // This ensures it works even if showSection() isn't loaded yet
    const loginInterface = document.querySelector('.auth-container');
    const dashboardElement = document.getElementById('dashboard');

    if (loginInterface) {
        loginInterface.style.display = 'none';
        console.log('✅ Login interface hidden');
    }

    if (dashboardElement) {
        dashboardElement.style.display = 'flex';
        console.log('✅ Dashboard shown');
    }

    // Update navigation if available
    if (typeof showSection === 'function') {
        showSection('dashboard');
        console.log('✅ Navigation updated via showSection()');
    } else {
        console.warn('⚠️ showSection() not available yet, using direct DOM manipulation');
        // Manually update nav active state
        const dashboardNav = document.getElementById('dashboard-nav');
        if (dashboardNav) {
            // Remove active from all nav items
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            // Add active to dashboard
            dashboardNav.classList.add('active');
        }
    }

    // Connect with the new token
    connectAndAuthorize(token);
}

/**
 * Connects to Deriv WebSocket using OAuth access token
 */
async function connectToDerivWithOAuth() {
    try {
        statusMessage.textContent = "Connecting with OAuth token...";

        // Ensure WebSocket connection
        if (!connection || connection.readyState !== WebSocket.OPEN) {
            console.log('Establishing WebSocket connection for OAuth...');
            connectToDeriv();

            // Wait for connection
            await new Promise((resolve, reject) => {
                const checkConnection = setInterval(() => {
                    if (connection && connection.readyState === WebSocket.OPEN) {
                        console.log('WebSocket connection established for OAuth');
                        clearInterval(checkConnection);
                        resolve();
                    }
                }, 100);

                setTimeout(() => {
                    clearInterval(checkConnection);
                    reject(new Error('Connection timeout'));
                }, 15000); // Increased timeout
            });
        }

        // Small delay to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 500));

        // Authorize with OAuth token
        console.log('Authorizing with OAuth token...');
        await authorizeWithOAuthToken();

        // Authorization successful - the UI should now be updated by app.js message handler
        console.log('✅ OAuth login completed successfully');

        // Clean up URL parameters
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

    } catch (error) {
        console.error('OAuth connection error:', error);
        showToast(`Connection failed: ${error.message}`, 'error');
        statusMessage.textContent = "OAuth connection failed. Please try again.";
    }
}

/**
 * Authorizes with Deriv using the OAuth access token
 */
function authorizeWithOAuthToken() {
    return new Promise((resolve, reject) => {
        if (!window.oauthState.access_token) {
            reject(new Error('No access token available'));
            return;
        }

        console.log('Authorizing with OAuth token...');

        const authRequest = {
            "authorize": window.oauthState.access_token,
            "passthrough": { "purpose": "oauth_login", "account_type": window.oauthState.account_type }
        };

        // Set up promise handlers that will be called from app.js message handler
        window.oauthResolve = resolve;
        window.oauthReject = reject;

        // Send authorization request
        const checkAuth = setTimeout(() => {
            if (window.oauthReject) {
                window.oauthReject(new Error('Authorization timeout'));
                delete window.oauthResolve;
                delete window.oauthReject;
            }
        }, 10000);

        // We'll handle the response in the message handler (app.js)
        sendAPIRequest(authRequest)
            .then(() => {
                console.log('OAuth authorization request sent, waiting for response...');
            })
            .catch(error => {
                clearTimeout(checkAuth);
                if (window.oauthReject) {
                    window.oauthReject(error);
                    delete window.oauthResolve;
                    delete window.oauthReject;
                }
            });
    });
}

// ===================================
// OAUTH FUNCTIONS
// ===================================

/**
 * Exchanges an authorization code for an access token via the PKCE token endpoint.
 * @param {string} code - The authorization code from the OAuth callback
 * @returns {Promise<string>} The access token
 */
async function exchangeCodeForToken(code) {
    const codeVerifier = sessionStorage.getItem('deriv_code_verifier');

    if (!codeVerifier) {
        throw new Error('PKCE code_verifier not found in session. Please try logging in again.');
    }

    console.log('🔒 Exchanging authorization code for access token...');

    const response = await fetch(OAUTH_CONFIG.token_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: OAUTH_CONFIG.client_id,
            code: code,
            redirect_uri: OAUTH_CONFIG.redirect_uri,
            code_verifier: codeVerifier
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error_description || errorData.error || `HTTP ${response.status}`;
        throw new Error(`Token exchange failed: ${errorMsg}`);
    }

    const data = await response.json();

    if (!data.access_token) {
        throw new Error('Token response did not contain an access_token');
    }

    console.log('✅ Token exchange successful');
    return data.access_token;
}

/**
 * Starts the Deriv OAuth login flow.
 * Redirects to oauth.deriv.com with the registered app_id.
 * Deriv returns tokens directly in the redirect URL (implicit flow).
 */
function startOAuthLogin() {
    console.log('🚀 Starting Deriv OAuth login...');

    try {
        // Generate a random state for basic CSRF protection
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem('deriv_auth_state', state);

        // Build the authorization URL
        const authParams = new URLSearchParams({
            app_id: OAUTH_CONFIG.app_id,
            l: OAUTH_CONFIG.language,
            brand: OAUTH_CONFIG.brand,
            redirect_uri: OAUTH_CONFIG.redirect_uri
        });

        const authUrl = `${OAUTH_CONFIG.authorization_url}?${authParams.toString()}`;

        console.log('🚀 Redirecting to Deriv OAuth...');
        console.log('Auth URL:', authUrl);

        window.location.href = authUrl;

    } catch (error) {
        console.error('❌ Failed to initiate OAuth login:', error);
        showToast('Failed to start login. Please try again.', 'error');
    }
}



// ===================================
// WEBSOCKET TESTING FUNCTION
// ===================================

function testWebSocketConnection() {
    console.log('🧪 Testing WebSocket connection...');

    // Clear any existing connection
    if (connection && connection.readyState === WebSocket.OPEN) {
        connection.close();
    }

    // Reset connection attempts
    reconnectAttempts = 0;

    // Try to connect
    console.log('🔄 Initiating test connection...');
    connectToDeriv();

    // Set a timeout to check the result
    setTimeout(() => {
        const status = connection ? connection.readyState : 'no connection';
        const statusText = {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED'
        }[status] || 'UNKNOWN';

        console.log('📊 Connection test result:', statusText);

        if (connection && connection.readyState === WebSocket.OPEN) {
            // showToast('✅ WebSocket connection successful!', 'success');
        } else {
            showToast('❌ WebSocket connection failed - check console for details', 'error');
        }
    }, 5000);
}