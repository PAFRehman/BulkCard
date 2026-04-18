function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      if (idx === -1) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
    })
  );
}

async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing X_CLIENT_ID or X_CLIENT_SECRET');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    },
    body: body.toString()
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Token exchange failed:', res.status, errorText);
    throw new Error(`Token exchange failed: ${res.status} ${errorText}`);
  }
  return res.json();
}

async function fetchXUser(accessToken) {
  const res = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username,verified', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('User fetch failed:', res.status, errorText);
    throw new Error(`User fetch failed: ${res.status} ${errorText}`);
  }
  return res.json();
}

function buildClearCookies(host) {
  const isLocalhost = (host || '').includes('localhost') || (host || '').includes('127.');
  const prefix = isLocalhost ? '' : '__Host-';
  const secureFlag = isLocalhost ? '' : ' Secure;';
  const opts = `Path=/; Max-Age=0; HttpOnly; SameSite=Lax;${secureFlag}`;
  
  return [
    `${prefix}x_oauth_verifier=; ${opts}`,
    `${prefix}x_oauth_state=; ${opts}`
  ];
}

exports.handler = async (event) => {
  const host = event.headers.host || '';
  const frontendUrl = process.env.FRONTEND_URL || `https://${host}`;
  const redirectUri = process.env.X_REDIRECT_URI;
  
  try {
    const params = event.queryStringParameters || {};
    const code = params.code;
    const returnedState = params.state;
    const oauthError = params.error;
    
    const cookies = parseCookies(event.headers.cookie);
    const isLocalhost = host.includes('localhost') || host.includes('127.');
    const prefix = isLocalhost ? '' : '__Host-';
    
    const codeVerifier = cookies[`${prefix}x_oauth_verifier`];
    const savedState = cookies[`${prefix}x_oauth_state`];
    const clearCookies = buildClearCookies(host);

    console.log('Callback received:', { hasCode: !!code, hasState: !!returnedState, hasError: !!oauthError });
    console.log('Cookies found:', Object.keys(cookies));

    if (oauthError) {
      return {
        statusCode: 302,
        headers: { 'Location': `${frontendUrl}/?oauth_error=${encodeURIComponent(oauthError)}`, 'Cache-Control': 'no-cache' },
        multiValueHeaders: { 'Set-Cookie': clearCookies }
      };
    }

    if (!code) {
      return {
        statusCode: 302,
        headers: { 'Location': `${frontendUrl}/?oauth_error=missing_code`, 'Cache-Control': 'no-cache' },
        multiValueHeaders: { 'Set-Cookie': clearCookies }
      };
    }

    if (!codeVerifier || !savedState) {
      console.error('Missing cookies. Got keys:', Object.keys(cookies));
      return {
        statusCode: 302,
        headers: { 'Location': `${frontendUrl}/?oauth_error=missing_cookies`, 'Cache-Control': 'no-cache' },
        multiValueHeaders: { 'Set-Cookie': clearCookies }
      };
    }

    if (returnedState !== savedState) {
      return {
        statusCode: 302,
        headers: { 'Location': `${frontendUrl}/?oauth_error=invalid_state`, 'Cache-Control': 'no-cache' },
        multiValueHeaders: { 'Set-Cookie': clearCookies }
      };
    }

    if (!redirectUri) {
      throw new Error('X_REDIRECT_URI not configured');
    }

    const tokenData = await exchangeCodeForToken(code, codeVerifier, redirectUri);

    if (!tokenData.access_token) {
      console.error('No access_token in response:', tokenData);
      return {
        statusCode: 302,
        headers: { 'Location': `${frontendUrl}/?oauth_error=token_exchange_failed`, 'Cache-Control': 'no-cache' },
        multiValueHeaders: { 'Set-Cookie': clearCookies }
      };
    }

    const userData = await fetchXUser(tokenData.access_token);
    const user = userData?.data;

    if (!user) {
      console.error('No user data returned:', userData);
      return {
        statusCode: 302,
        headers: { 'Location': `${frontendUrl}/?oauth_error=user_fetch_failed`, 'Cache-Control': 'no-cache' },
        multiValueHeaders: { 'Set-Cookie': clearCookies }
      };
    }

    // Upgrade PFP to high-res
    let pfpUrl = user.profile_image_url || '';
    if (pfpUrl) {
      pfpUrl = pfpUrl.replace('_normal', '').replace('_mini', '').replace('_bigger', '');
    }

    const redirectTo = new URL(frontendUrl);
    redirectTo.searchParams.set('oauth_success', '1');
    redirectTo.searchParams.set('handle', user.username);
    redirectTo.searchParams.set('name', user.name || '');
    redirectTo.searchParams.set('pfp', pfpUrl);
    if (user.verified) redirectTo.searchParams.set('verified', '1');

    console.log('Success! Redirecting to frontend for user:', user.username);

    return {
      statusCode: 302,
      headers: { 
        'Location': redirectTo.toString(), 
        'Cache-Control': 'no-cache' 
      },
      multiValueHeaders: { 'Set-Cookie': clearCookies }
    };

  } catch (err) {
    console.error('auth-callback crashed:', err);
    const clearCookies = buildClearCookies(host);
    return {
      statusCode: 302,
      headers: { 
        'Location': `${frontendUrl}/?oauth_error=${encodeURIComponent(err.message)}`,
        'Cache-Control': 'no-cache'
      },
      multiValueHeaders: { 'Set-Cookie': clearCookies }
    };
  }
};
