/**
 * Ghost Recorder - API Server
 * Serves cached market data to the frontend
 */

const express = require('express');
const cors = require('cors');
const redis = require('redis');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const app = express();
app.use(cors()); // Allow all origins (or restrict to your domain in prod)
app.use(express.json());

// Redis Client with resiliency
const redisClient = redis.createClient({
    url: REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        keepAlive: 10000,
        connectTimeout: 10000
    }
});
redisClient.on('error', err => console.error('🚨 Redis API Error:', err.message));

// Connect to Redis on start
(async () => {
    try {
        await redisClient.connect();
        console.log('✅ API Connected to Redis');
    } catch (err) {
        console.error('❌ Redis Connection Failed:', err.message);
    }
})();

// Global error handlers to prevent silent death
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
});

// === ENDPOINTS ===

// 1. Health Check
app.get('/', (req, res) => {
    res.send({ status: 'Ghost Recorder API is Running 👻' });
});

// 2. Get Single Market Data with custom lookback
// Usage: /api/market/R_10?lookback=500
app.get('/api/market/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    const lookback = parseInt(req.query.lookback) || 1000;

    try {
        const data = await redisClient.get(`ghost:market:${symbol}`);
        if (!data) {
            return res.status(404).json({ error: 'Market data not found (Recorder might be starting)' });
        }

        const marketData = JSON.parse(data);

        // Recalculate stats with custom lookback if different from stored
        if (lookback !== 1000) {
            const { calculateStats } = require('./stats');
            marketData.stats = calculateStats(marketData.last_1000_ticks, lookback);
        }

        res.json(marketData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. Get All Active Markets (For Dashboard initialization)
// Usage: /api/snapshot
app.get('/api/snapshot', async (req, res) => {
    // List of keys we track (could also use SCAN but we know the list)
    const MARKETS = [
        'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
        'R_10DB', 'R_25DB', 'R_50DB', 'R_75DB', 'R_100DB',
        '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'
    ];

    try {
        const pipeline = redisClient.multi();
        MARKETS.forEach(symbol => {
            pipeline.get(`ghost:market:${symbol}`);
        });

        const results = await pipeline.exec();

        // Construct response object
        const snapshot = {};
        MARKETS.forEach((symbol, index) => {
            const data = results[index];
            if (data) {
                snapshot[symbol] = JSON.parse(data);
            }
        });

        res.json(snapshot);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Start the basic Recorder process alongside API?
// Usually better to run separately, but for simplicity in one container:
// Start the Recorder process alongside API
const { startRecorder } = require('./recorder');

app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);

    // Start Recorder with shared safety catch and shared Redis client
    try {
        startRecorder(redisClient).catch(err => {
            console.error('🚨 Recorder failed to start:', err.message);
        });
    } catch (err) {
        console.error('🚨 Recorder Startup Error:', err.message);
    }
});
