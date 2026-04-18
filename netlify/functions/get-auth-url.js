exports.handler = async (event, context) => {
  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;
  
  const scope = "tweet.read users.read follows.read offline.access";
  const state = Math.random().toString(36).substring(2);
  const codeChallenge = "challenge";
  const codeChallengeMethod = "plain";

  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=${codeChallengeMethod}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax`
    },
    body: ""
  };
};
