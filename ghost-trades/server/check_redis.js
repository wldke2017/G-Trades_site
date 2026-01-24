const redis = require('redis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

(async () => {
    const client = redis.createClient({ url: REDIS_URL });
    client.on('error', err => console.log('Redis Error:', err.message));

    try {
        await client.connect();
        console.log('Connected to Redis...');

        const data = await client.get('ghost:market:R_10');
        if (data) {
            const parsed = JSON.parse(data);
            console.log(`✅ FOUND DATA for R_10! Ticks count: ${parsed.last_1000_ticks.length}`);
            console.log(`📊 Last Stats:`, JSON.stringify(parsed.stats.distribution.last1000, null, 2));
        } else {
            console.log('❌ NO DATA FOUND for R_10. Recorder might have failed to save.');
        }
    } catch (e) {
        console.log('Error checking Redis:', e.message);
    } finally {
        await client.disconnect();
    }
})();
