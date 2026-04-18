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
      console.error('Missing env vars:', { hasClientId: !!clientId, hasRedirectUri: !!redirectUri });
      return {
        statusCode: 500,
        headers: { 
          'Access-Control-Allow-Origin': '*', 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ error: 'Server misconfiguration: missing X_CLIENT_ID or X_REDIRECT_URI' })
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

    // Detect local vs production for cookie security
    const host = event.headers.host || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.');
    
    // Use __Host- prefix only on HTTPS production
    const prefix = isLocalhost ? '' : '__Host-';
    const maxAge = 600; // 10 minutes
    const secureFlag = isLocalhost ? '' : ' Secure;';
    
    const cookieOptions = `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax;${secureFlag}`;
    
    const cookie1 = `${prefix}x_oauth_verifier=${codeVerifier}; ${cookieOptions}`;
    const cookie2 = `${prefix}x_oauth_state=${state}; ${cookieOptions}`;

    console.log('Generated auth URL for host:', host);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': event.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      // CRITICAL FIX: Use multiValueHeaders for multiple Set-Cookie
      multiValueHeaders: {
        'Set-Cookie': [cookie1, cookie2]
      },
      body: JSON.stringify({ authUrl })
    };

  } catch (err) {
    console.error('get-auth-url crashed:', err);
    return {
      statusCode: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ error: 'Internal server error', details: err.message })
    };
  }
};
