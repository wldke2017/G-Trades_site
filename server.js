const express = require('express');
const path = require('path');
const http = require('http');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Routes
app.get('/health', (req, res) => res.status(200).send('Ghost Trades OK'));
app.get('/healthcheck', (req, res) => res.status(200).send('OK'));

// Mount AI Strategy API
const aiStrategyRouter = require('./api/ai_strategy');
app.use('/api/ai', aiStrategyRouter);

// Serve Ghost Trades app at root
app.use('/', express.static(path.join(__dirname, 'ghost-trades')));

// Keep-Alive Logic for Render Free Tier
function startKeepAlive() {
    const URL = 'https://ghost-trades.site/healthcheck';
    const INTERVAL = 10 * 60 * 1000; // 10 minutes

    console.log(`📡 Keep-alive service started. Pinging ${URL} every 10 minutes.`);

    setInterval(async () => {
        try {
            const response = await fetch(URL);
            if (response.ok) {
                console.log(`✅ Keep-alive ping successful: ${new Date().toLocaleTimeString()}`);
            } else {
                console.warn(`⚠️ Keep-alive ping failed (Status ${response.status}): ${new Date().toLocaleTimeString()}`);
            }
        } catch (error) {
            console.error(`❌ Keep-alive error: ${error.message}`);
        }
    }, INTERVAL);
}

const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`
🚀 Ghost Trades Standalone Server
📍 Landing: http://localhost:${PORT}
⚡ App:     http://localhost:${PORT}/ghost-trades
🤖 AI API:  http://localhost:${PORT}/api/ai
    `);

    // Start the keep-alive pings
    startKeepAlive();
});
