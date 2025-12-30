const express = require('express');
const path = require('path');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000; // Use 4000 to avoid clash with Escrow if testing locally

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => res.status(200).send('Ghost Trades OK'));

// Mount AI Strategy API
const aiStrategyRouter = require('./api/ai_strategy');
app.use('/api/ai', aiStrategyRouter);

// Serve Landing Page as root
app.use('/', express.static(path.join(__dirname, 'landing')));

// Serve Ghost Trades app
app.use('/ghost-trades', express.static(path.join(__dirname, 'ghost-trades')));

// Handle direct access to ghost-trades index
app.get('/ghost-trades', (req, res) => {
    res.sendFile(path.join(__dirname, 'ghost-trades', 'index.html'));
});

const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`
🚀 Ghost Trades Standalone Server
📍 Landing: http://localhost:${PORT}
⚡ App:     http://localhost:${PORT}/ghost-trades
🤖 AI API:  http://localhost:${PORT}/api/ai
    `);
});
