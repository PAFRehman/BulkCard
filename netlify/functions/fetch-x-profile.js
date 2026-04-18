exports.handler = async (event) => {
    try {
        const username = event.queryStringParameters?.username;
        if (!username) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing username parameter' })
            };
        }

        const bearerToken = process.env.X_BEARER_TOKEN;
        if (!bearerToken) {
            return {
                statusCode: 501,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'X_BEARER_TOKEN not configured. Add it to Netlify env vars to enable server-side fetching.' })
            };
        }

        const res = await fetch(
            `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name,username,verified`,
            { headers: { 'Authorization': `Bearer ${bearerToken}` } }
        );

        if (!res.ok) {
            const error = await res.text();
            return {
                statusCode: res.status,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `X API error: ${error}` })
            };
        }

        const data = await res.json();
        if (data.data?.profile_image_url) {
            data.data.profile_image_url = data.data.profile_image_url.replace('_normal', '').replace('_mini', '').replace('_bigger', '');
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
