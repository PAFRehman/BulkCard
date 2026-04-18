
exports.handler = async (event, context) => {
  const token = event.queryStringParameters.token;

  const res = await fetch("https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url,public_metrics", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
};




























