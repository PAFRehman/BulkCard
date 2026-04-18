function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    return Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [key, ...v] = c.trim().split('=');
            return [key.trim(), decodeURIComponent(v.join('='))];
        })
    );
}

async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
        }).toString()
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Token exchange failed: ${error}`);
    }
    return res.json();
}

async function fetchXUser(accessToken) {
    const res = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username,verified', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`User fetch failed: ${error}`);
    }
    return res.json();
}

exports.handler = async (event) => {
    try {
        const { code, state: returnedState, error: oauthError } = event.queryStringParameters || {};
        const cookies = parseCookies(event.headers.cookie);
        const isLocalhost = (event.headers.host || '').includes('localhost') || (event.headers.host || '').includes('127.');
        const prefix = isLocalhost ? '' : '__Host-';

        const codeVerifier = cookies[`${prefix}x_oauth_verifier`];
        const savedState = cookies[`${prefix}x_oauth_state`];

        const redirectUri = process.env.X_REDIRECT_URI;
        const frontendUrl = process.env.FRONTEND_URL || (redirectUri ? redirectUri.replace('/.netlify/functions/auth-callback', '') : `https://${event.headers.host}`);

        // Clear cookies immediately
        const clearOptions = `Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isLocalhost ? '' : '; Secure'}`;
        const clearCookies = [
            `${prefix}x_oauth_verifier=; ${clearOptions}`,
            `${prefix}x_oauth_state=; ${clearOptions}`
        ];

        if (oauthError) {
            return {
                statusCode: 302,
                headers: {
                    'Location': `${frontendUrl}/?oauth_error=${encodeURIComponent(oauthError)}`,
                    'Set-Cookie': clearCookies,
                    'Cache-Control': 'no-cache'
                }
            };
        }

        if (!code || !codeVerifier || !savedState) {
            return {
                statusCode: 302,
                headers: {
                    'Location': `${frontendUrl}/?oauth_error=missing_params`,
                    'Set-Cookie': clearCookies,
                    'Cache-Control': 'no-cache'
                }
            };
        }

        if (returnedState !== savedState) {
            return {
                statusCode: 302,
                headers: {
                    'Location': `${frontendUrl}/?oauth_error=invalid_state`,
                    'Set-Cookie': clearCookies,
                    'Cache-Control': 'no-cache'
                }
            };
        }

        const tokenData = await exchangeCodeForToken(code, codeVerifier, redirectUri);

        if (!tokenData.access_token) {
            return {
                statusCode: 302,
                headers: {
                    'Location': `${frontendUrl}/?oauth_error=token_exchange_failed`,
                    'Set-Cookie': clearCookies,
                    'Cache-Control': 'no-cache'
                }
            };
        }

        const userData = await fetchXUser(tokenData.access_token);
        const user = userData.data;

        if (!user) {
            return {
                statusCode: 302,
                headers: {
                    'Location': `${frontendUrl}/?oauth_error=user_fetch_failed`,
                    'Set-Cookie': clearCookies,
                    'Cache-Control': 'no-cache'
                }
            };
        }

        // Upgrade PFP to high-res by removing Twitter size suffixes
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

        return {
            statusCode: 302,
            headers: {
                'Location': redirectTo.toString(),
                'Set-Cookie': clearCookies,
                'Cache-Control': 'no-cache'
            }
        };

    } catch (err) {
        console.error('Auth callback error:', err);
        const fallbackUrl = process.env.FRONTEND_URL || `https://${event.headers.host}`;
        return {
            statusCode: 302,
            headers: {
                'Location': `${fallbackUrl}/?oauth_error=${encodeURIComponent(err.message)}`,
                'Cache-Control': 'no-cache'
            }
        };
    }
};
