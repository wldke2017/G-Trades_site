class GhostBackgroundService {
    constructor() {
        this.ws = null;
        // Use the user's own stored token instead of a hardcoded one.
        // The hardcoded token was expired/disabled causing "Account is disabled" errors.
        this.token = localStorage.getItem('deriv_token') || null;
        this.appId = 119056;
        this.isConnected = false;
        this.onTradeResult = null; // Callback (contract, isWin, profit, strategy)

        // Track contracts to know their strategy/metadata
        this.activeContracts = new Map(); // contractId -> { strategy, prediction, etc }
    }

    connect() {
        // Always pull the latest token from storage (user may have logged in after construction)
        this.token = localStorage.getItem('deriv_token') || null;

        // Don't attempt to connect if there's no token — avoids "DisabledClient" errors
        if (!this.token) {
            console.log('👻 Ghost Service: No token available. Skipping connection until user logs in.');
            return;
        }

        this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`);

        this.ws.onopen = () => {
            console.log("👻 Ghost Service: Connected");
            this.authorize();
        };

        this.ws.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                this.handleMessage(data);
            } catch (e) {
                console.error("Ghost Service JSON Error", e);
            }
        };

        this.ws.onclose = () => {
            console.log("👻 Ghost Service: Disconnected. Reconnecting...");
            this.isConnected = false;
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (err) => {
            console.error("Ghost Service Error", err);
        };
    }

    authorize() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ authorize: this.token }));
        }
    }

    placeTrade(request) {
        if (!this.isConnected) {
            console.error("👻 Ghost Service not connected! Cannot place trade.");
            return;
        }

        // Store metadata for this request? 
        // We can't map request-to-contract until we get 'buy' response.
        // We rely on 'echo_req' in 'buy' response.

        this.ws.send(JSON.stringify(request));
    }

    handleMessage(data) {
        const msgType = data.msg_type;

        if (msgType === 'authorize') {
            this.isConnected = true;
            console.log("👻 Ghost Service: Authorization Successful");
        }

        if (msgType === 'buy') {
            const passthrough = data.echo_req ? data.echo_req.passthrough : null;

            if (data.error) {
                console.error(`👻 Ghost Trade Error: ${data.error.message}`, data.error);
                if (passthrough && this.onTradeResult) {
                    this.onTradeResult({
                        error: data.error.message,
                        passthrough: passthrough,
                        isVirtual: true,
                        isFailure: true
                    });
                }
                return;
            }

            // Trade placed successfully
            const contractId = data.buy.contract_id;

            if (passthrough) {
                this.activeContracts.set(contractId, passthrough);
                console.log(`👻 Ghost Trade Placed: ID ${contractId} (${passthrough.strategy})`);

                // ADD TO LIVE MONITOR
                if (typeof window.addLiveContract === 'function') {
                    const entryTick = data.buy.entry_tick_display_value ? parseInt(data.buy.entry_tick_display_value.slice(-1)) : '?';
                    const contractType = (passthrough.barrier <= 4) ? 'OVER' : 'UNDER';
                    window.addLiveContract(contractId, passthrough.symbol, entryTick, passthrough.barrier, contractType);
                }
            }
        }

        if (msgType === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            const contractId = contract.contract_id;

            // Check if sold (finished)
            if (contract.is_sold) {
                const isWin = contract.status === 'won';
                const profit = parseFloat(contract.profit);

                // FINALIZE IN LIVE MONITOR
                try {
                    if (typeof window.finalizeLiveContract === 'function') {
                        window.finalizeLiveContract(contractId, isWin, profit);
                    } else if (typeof window.removeLiveContract === 'function') {
                        window.removeLiveContract(contractId);
                    }
                } catch (e) {
                    console.error("error finalizing live contract:", e);
                }

                // Retrieve metadata
                const metadata = this.activeContracts.get(contractId);

                if (metadata && this.onTradeResult) {
                    // Send result back to bot
                    try {
                        this.onTradeResult({
                            isWin: isWin,
                            profit: profit,
                            contract: contract,
                            passthrough: metadata,
                            isVirtual: true // Flag for history
                        });
                    } catch (e) {
                        console.error("error in onTradeResult callback:", e);
                    }

                    // Cleanup
                    this.activeContracts.delete(contractId);
                }
            } else {
                // UPDATE LIVE MONITOR
                if (typeof window.updateLiveContractMonitor === 'function' && contract.current_spot_display_value) {
                    window.updateLiveContractMonitor(contractId, contract.symbol, contract.current_spot_display_value);
                }
            }
        }
    }
}

// Export global instance
window.ghostService = new GhostBackgroundService();
window.ghostService.connect();

// Heartbeat / Connection Watchdog
setInterval(() => {
    if (window.ghostService && !window.ghostService.isConnected) {
        console.warn("💓 Ghost Service Heartbeat: Disconnected. Attempting reconnect...");
        window.ghostService.connect();
    }
}, 5000);
