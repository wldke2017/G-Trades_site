/**
 * Ghost Recorder - Main Script
 * Connects to Deriv WS, Records Ticks, Saves to Redis
 */

const WebSocket = require('ws');
const redis = require('redis');
const { calculateStats } = require('./stats');
require('dotenv').config();

// Configuration
const DERIV_WS_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089'; // Public App ID
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Active Markets to Record (Synced with frontend trading.js)
const MARKETS = [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
    'JD10', 'JD25', 'JD50', 'JD75', 'JD100',
    'RDBEAR', 'RDBULL'
];

// In-Memory Storage (Last 1000 ticks)
const marketData = {};

MARKETS.forEach(symbol => {
    marketData[symbol] = {
        ticks: [], // Array of last digits
        raw_prices: [] // Optional: keep full price if needed, but digits are usually enough for this bot
    };
});

let sharedRedisClient;

async function startRecorder(client) {
    if (client) {
        sharedRedisClient = client;
        console.log('✅ Recorder using shared Redis client');
    } else {
        // Fallback for standalone run
        // Redis Client with resiliency
        const redisClient = redis.createClient({
            url: REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
                keepAlive: 10000,
                connectTimeout: 10000
            }
        });

        redisClient.on('error', err => console.error('🚨 Redis Recorder Error:', err.message));
        sharedRedisClient = redisClient;
        await sharedRedisClient.connect();
        console.log('✅ Connected to Redis (Standalone)');
    }

    connectToDeriv();
}

let ws;
let pingInterval;

function connectToDeriv() {
    console.log('🔄 Connecting to Deriv WebSocket...');
    ws = new WebSocket(DERIV_WS_URL);

    ws.on('open', () => {
        console.log('✅ Deriv WebSocket Open');

        // Subscribe to ticks
        const request = {
            ticks_history: MARKETS[0], // Start with one to get history
            count: 1000,
            end: 'latest',
            style: 'ticks',
            subscribe: 1
        };

        // We need to subscribe to ALL markets. 
        // Deriv allows multiple subscriptions? Yes.
        // But better to send individual requests.
        MARKETS.forEach(symbol => {
            ws.send(JSON.stringify({
                ticks_history: symbol,
                count: 1000,
                end: 'latest',
                style: 'ticks',
                subscribe: 1
            }));
        });

        // Keep Alive
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ ping: 1 }));
            }
        }, 10000);
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.msg_type === 'history') {
                handleHistory(msg);
            } else if (msg.msg_type === 'tick') {
                handleTick(msg);
            } else if (msg.msg_type === 'error' || msg.error) {
                console.error('❌ Deriv API Error:', msg.error || msg);
            }
        } catch (e) {
            console.error('❌ Message Processing Error:', e.message);
        }
    });

    ws.on('close', () => {
        console.warn('⚠️ Deriv WebSocket Closed. Reconnecting...');
        clearInterval(pingInterval);
        setTimeout(connectToDeriv, 5000);
    });

    ws.on('error', (err) => {
        console.error('❌ WebSocket Error:', err);
    });
}

function handleHistory(msg) {
    const symbol = msg.echo_req.ticks_history;
    const history = msg.history;

    if (history && history.prices) {
        // Init with last 1000
        const prices = history.prices;
        const digits = prices.map(p => parseInt(p.toString().slice(-1)));

        marketData[symbol].ticks = digits;
        console.log(`📦 History loaded for ${symbol}: ${digits.length} ticks`);

        // Save Initial Snapshot
        saveToRedis(symbol);
    }
}

function handleTick(msg) {
    try {
        const symbol = msg.tick.symbol;
        const price = msg.tick.quote;
        const digit = parseInt(price.toString().slice(-1));

        if (marketData[symbol]) {
            // Appending new tick
            marketData[symbol].ticks.push(digit);

            // Keep only last 1000
            if (marketData[symbol].ticks.length > 1000) {
                marketData[symbol].ticks.shift();
            }

            // Save Update
            saveToRedis(symbol).catch(err => console.error(`❌ Redis Save Error (${symbol}):`, err.message));
        }
    } catch (e) {
        console.error('❌ Tick Handling Error:', e.message);
    }
}

async function saveToRedis(symbol) {
    try {
        const data = marketData[symbol];
        if (!data || !data.ticks || data.ticks.length === 0) return;

        const stats = calculateStats(data.ticks);

        const payload = {
            symbol: symbol,
            timestamp: Date.now(),
            last_1000_ticks: data.ticks, // Full history
            stats: stats // Pre-calculated percentages
        };

        // Save as a simple stringified JSON
        await sharedRedisClient.set(`ghost:market:${symbol}`, JSON.stringify(payload));

        // Also publish for real-time subscribers
        await sharedRedisClient.publish(`ghost:updates:${symbol}`, JSON.stringify(payload));
    } catch (e) {
        console.error(`🚨 Redis Error for ${symbol}:`, e.message);
        // Don't throw - we don't want to kill the process for one failed Redis save
    }
}

// Run if called directly
if (require.main === module) {
    startRecorder();
}

module.exports = { startRecorder };
