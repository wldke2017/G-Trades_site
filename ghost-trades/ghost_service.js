class GhostBackgroundService {
    constructor() {
        this.ws = null;
        this.token = "gaevoMo6NeKj1Dr"; // Hardcoded Ghost Token
        this.appId = 119056;
        this.isConnected = false;
        this.onTradeResult = null; // Callback (contract, isWin, profit, strategy)

        // Track contracts to know their strategy/metadata
        this.activeContracts = new Map(); // contractId -> { strategy, prediction, etc }
    }

    connect() {
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
            // Trade placed successfully
            const contractId = data.buy.contract_id;
            const passthrough = data.echo_req.passthrough;

            if (passthrough) {
                this.activeContracts.set(contractId, passthrough);
                console.log(`👻 Ghost Trade Placed: ID ${contractId} (${passthrough.strategy})`);
            }

            // Subscribe to this contract specifically?
            // request had "subscribe": 1, so we should get updates.
        }

        if (msgType === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            const contractId = contract.contract_id;

            // Check if sold (finished)
            if (contract.is_sold) {
                const isWin = contract.status === 'won';
                const profit = parseFloat(contract.profit);

                // Retrieve metadata
                const metadata = this.activeContracts.get(contractId);

                if (metadata && this.onTradeResult) {
                    // Send result back to bot
                    this.onTradeResult({
                        isWin: isWin,
                        profit: profit,
                        contract: contract,
                        passthrough: metadata,
                        isVirtual: true // Flag for history
                    });

                    // Cleanup
                    this.activeContracts.delete(contractId);
                }
            }
        }
    }
}

// Export global instance
window.ghostService = new GhostBackgroundService();
window.ghostService.connect();
