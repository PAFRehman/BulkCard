exports.handler = async (event, context) => {
  const { code, state } = event.queryStringParameters;
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: "challenge"
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return { statusCode: 400, body: JSON.stringify(tokenData) };
  }

  return {
    statusCode: 302,
    headers: {
      Location: `/?token=${tokenData.access_token}`
    },
    body: ""
  };
};
