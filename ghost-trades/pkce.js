// ===================================
// PKCE (Proof Key for Code Exchange) UTILITIES
// OAuth 2.0 Authorization Code Flow with PKCE
// ===================================

/**
 * Generates a cryptographically random code verifier string.
 * The verifier is a high-entropy random string used in the PKCE flow.
 * It is stored in sessionStorage and sent to the token endpoint during code exchange.
 * @returns {string} A 128-character hex string
 */
function generateCodeVerifier() {
    const array = new Uint32Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

/**
 * Computes the SHA-256 code challenge from the given code verifier.
 * The challenge is the Base64URL-encoded SHA-256 hash of the verifier.
 * Only the challenge is sent to the authorization server; the verifier is kept secret.
 * @param {string} verifier - The code verifier string
 * @returns {Promise<string>} The Base64URL-encoded SHA-256 hash
 */
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);

    // Base64URL encode the hash (no padding, URL-safe characters)
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return challenge;
}

/**
 * Generates a cryptographically random state parameter for CSRF protection.
 * This value is stored in sessionStorage before the redirect and validated on return.
 * @returns {string} A 64-character hex string
 */
function generateState() {
    const array = new Uint32Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

/**
 * Generates a complete PKCE pair (code_verifier + code_challenge).
 * Convenience function combining generateCodeVerifier() and generateCodeChallenge().
 * @returns {Promise<{verifier: string, challenge: string}>}
 */
async function generatePkcePair() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    return { verifier, challenge };
}

// Expose globally for cross-module access
window.generatePkcePair = generatePkcePair;
window.generateState = generateState;
window.generateCodeVerifier = generateCodeVerifier;
window.generateCodeChallenge = generateCodeChallenge;
