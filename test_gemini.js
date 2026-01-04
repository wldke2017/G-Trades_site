require('dotenv').config();
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function testGenerate() {
    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`);
        const data = await response.json();

        if (data.models) {
            const fs = require('fs');
            fs.writeFileSync('models.json', JSON.stringify(data.models, null, 2));
            console.log('Models written to models.json');
        }
    } catch (error) {
        console.error(error);
    }
}

testGenerate();
