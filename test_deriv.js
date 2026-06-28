const WebSocket = require('ws');

const APP_ID = 119056;
const TOKEN = "gaevoMo6NeKj1Dr";
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

console.log(`Connecting to Deriv WebSocket: ${WS_URL}...`);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log('✅ WebSocket Connected!');
    console.log(`Sending authorization request for token: ${TOKEN}...`);
    ws.send(JSON.stringify({ authorize: TOKEN }));
});

ws.on('message', (data) => {
    const response = JSON.parse(data);
    console.log('📩 Received Response:', JSON.stringify(response, null, 2));
    ws.close();
});

ws.on('error', (err) => {
    console.error('❌ WebSocket Error:', err.message);
});

ws.on('close', () => {
    console.log('🔌 WebSocket Closed');
});
