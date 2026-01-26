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


const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`
🚀 Ghost Trades Standalone Server
📍 Local Host: http://localhost:${PORT}
🤖 AI API:     http://localhost:${PORT}/api/ai
    `);
});
