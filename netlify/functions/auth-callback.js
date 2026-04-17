exports.handler = async (event) => {
    const { code, state, error } = event.queryStringParameters || {};
    const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:8888';

    if (error) {
        return {
            statusCode: 302,
            headers: { Location: `${siteUrl}/?oauth_error=${encodeURIComponent(error)}` },
            body: '',
        };
    }

    if (!code || !state) {
        return {
            statusCode: 302,
            headers: { Location: `${siteUrl}/?oauth_error=missing_params` },
            body: '',
        };
    }

    try {
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        const redirectUri = process.env.X_REDIRECT_URI || `${siteUrl}/.netlify/functions/auth-callback`;

        if (!clientId || !clientSecret) {
            throw new Error('Missing X_CLIENT_ID or X_CLIENT_SECRET');
        }

        let codeVerifier;
        try {
            const stateStr = Buffer.from(state, 'base64url').toString('utf8');
            const parts = stateStr.split('|');
            codeVerifier = parts[1];
        } catch (e) {
            return {
                statusCode: 302,
                headers: { Location: `${siteUrl}/?oauth_error=invalid_state_format` },
                body: '',
            };
        }

        if (!codeVerifier) {
            return {
                statusCode: 302,
                headers: { Location: `${siteUrl}/?oauth_error=missing_verifier` },
                body: '',
            };
        }

        const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }).toString(),
        });

        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            return {
                statusCode: 302,
                headers: { Location: `${siteUrl}/?oauth_error=token_exchange_failed` },
                body: '',
            };
        }

        const userRes = await fetch(
            'https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name,description,public_metrics,verified', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        
        const userData = await userRes.json();
        
        if (!userRes.ok || !userData.data) {
            return {
                statusCode: 302,
                headers: { Location: `${siteUrl}/?oauth_error=user_fetch_failed` },
                body: '',
            };
        }
        
        const user = userData.data;
        const pfp = (user.profile_image_url || '').replace('_normal', '_400x400');
        const params = new URLSearchParams({
            oauth_success: '1',
            handle: user.username,
            name: user.name || user.username,
            pfp: pfp,
        });

        return {
            statusCode: 302,
            headers: { Location: `${siteUrl}/?${params.toString()}` },
            body: '',
        };
    } catch (err) {
        return {
            statusCode: 302,
            headers: { Location: `${siteUrl}/?oauth_error=${encodeURIComponent(err.message)}` },
            body: '',
        };
    }
};
