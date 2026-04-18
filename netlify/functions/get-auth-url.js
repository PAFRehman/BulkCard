const crypto = require('crypto');

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
    return crypto.randomBytes(24).toString('hex');
}

exports.handler = async (event) => {
    try {
        const clientId = process.env.X_CLIENT_ID;
        const redirectUri = process.env.X_REDIRECT_URI;

        if (!clientId || !redirectUri) {
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing X_CLIENT_ID or X_REDIRECT_URI' })
            };
        }

        const codeVerifier = generateCodeVerifier();
        const state = generateState();
        const codeChallenge = generateCodeChallenge(codeVerifier);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: 'users.read tweet.read',
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

        // Secure cookie handling — __Host- prefix requires Path=/, Secure, no Domain
        const isLocalhost = (event.headers.host || '').includes('localhost') || (event.headers.host || '').includes('127.');
        const prefix = isLocalhost ? '' : '__Host-';
        const cookieOptions = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax${isLocalhost ? '' : '; Secure'}`;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': event.headers.origin || '*',
                'Access-Control-Allow-Credentials': 'true',
                'Set-Cookie': [
                    `${prefix}x_oauth_verifier=${codeVerifier}; ${cookieOptions}`,
                    `${prefix}x_oauth_state=${state}; ${cookieOptions}`
                ]
            },
            body: JSON.stringify({ authUrl })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
