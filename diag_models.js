const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
    try {
        const nextPageToken = "Ch9tb2RlbHMvdmVvLTMuMS1nZW5lcmF0ZS1wcmV2aWV3";
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageToken=${nextPageToken}`;
        const response = await fetch(url);
        const data = await response.json();
        fs.writeFileSync('models_list_p2.json', JSON.stringify(data, null, 2));
        console.log('✅ Models page 2 saved to models_list_p2.json');
    } catch (error) {
        console.error('Error:', error);
    }
}

listModels();
