const crypto = require("crypto");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));
const { getTokens, saveTokens } = require("./tokenStore");

const TWITTER_API_URL = "https://api.twitter.com/2/tweets";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const MAX_TWEET_LENGTH = 280;

const CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL = process.env.TWITTER_CALLBACK_URL;

const LEGACY_BEARER = process.env.TWITTER_BEARER_TOKEN || "";

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generatePkcePair() {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = base64UrlEncode(hash);
  return { codeVerifier, codeChallenge };
}

function sanitizeTweet(text = "") {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Cannot post an empty tweet.");
  }

  if (trimmed.length > MAX_TWEET_LENGTH) {
    return `${trimmed.slice(0, MAX_TWEET_LENGTH - 1)}…`;
  }

  return trimmed;
}

function getAuthStatus() {
  const tokens = getTokens();
  if (!tokens) {
    return { authenticated: Boolean(LEGACY_BEARER), expiresAt: null };
  }

  return {
    authenticated: true,
    expiresAt: tokens.expires_at || null,
    hasRefreshToken: Boolean(tokens.refresh_token)
  };
}

function computeExpiresAt(expiresInSeconds) {
  const buffer = 60 * 1000; // 1 minute safety buffer
  return Date.now() + Math.max(expiresInSeconds * 1000 - buffer, buffer);
}

async function exchangeAuthCode(code, codeVerifier) {
  if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL) {
    throw new Error("Missing TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET or TWITTER_CALLBACK_URL.");
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK_URL,
    code_verifier: codeVerifier
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.error_description || body?.error || response.statusText);
  }

  const tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token || null,
    expires_at: body.expires_in ? computeExpiresAt(body.expires_in) : null,
    scope: body.scope
  };

  saveTokens(tokens);
  console.log("[Twitter] OAuth tokens stored successfully.");
  return tokens;
}

async function refreshAccessToken(refreshToken) {
  if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL) {
    throw new Error("Missing TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET or TWITTER_CALLBACK_URL.");
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.error_description || body?.error || response.statusText);
  }

  const tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token || refreshToken,
    expires_at: body.expires_in ? computeExpiresAt(body.expires_in) : null,
    scope: body.scope
  };

  saveTokens(tokens);
  console.log("[Twitter] Access token refreshed.");
  return tokens;
}

async function ensureAccessToken() {
  // Prefer a user access token stored in tokenStore (OAuth2 user-context).
  const tokens = getTokens();
  if (tokens && tokens.access_token) {
    const now = Date.now();
    if (tokens.expires_at && now >= tokens.expires_at - 60 * 1000) {
      if (!tokens.refresh_token) {
        throw new Error("Stored access token expired and no refresh token is available.");
      }
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      return refreshed.access_token;
    }

    console.log('[Twitter] Using stored user access token. Expires at:', tokens.expires_at || 'none');
    return tokens.access_token;
  }

  // If no user token is available, fall back to any legacy/app-only bearer token (limited endpoints).
  if (LEGACY_BEARER) {
    console.log('[Twitter] No user token found; falling back to legacy app-only bearer token.');
    return LEGACY_BEARER;
  }

  throw new Error("Twitter account is not authorized yet. Visit /auth/start to authorize.");
}

async function postTweet(text) {
  const accessToken = await ensureAccessToken();
  const payload = { text: sanitizeTweet(text) };
  // First attempt
  let response = await fetch(TWITTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let responseBody = await response.json().catch(() => ({}));

  // If Twitter rejects due to duplicate content, try a one-off suffix and retry once
  if (!response.ok) {
    // Normalize possible error shapes
    const apiErrors = responseBody?.errors || null;
    let errorMessage = responseBody?.detail || responseBody?.error || responseBody?.title || response.statusText || "Unknown error posting tweet.";
    if (Array.isArray(apiErrors) && apiErrors.length) {
      errorMessage = apiErrors.map((e) => e?.detail || e?.message || JSON.stringify(e)).join(" | ");
    }

    // Log full response for debugging
    console.error("[Twitter] Post tweet failed:", response.status, errorMessage, responseBody);

    if (response.status === 403 && /duplicate/i.test(String(errorMessage))) {
      try {
        const suffix = ` #${Date.now().toString().slice(-5)}`;
        const altPayload = { text: sanitizeTweet(String(payload.text) + suffix) };
        console.log(`[Twitter] Duplicate tweet detected — retrying with suffix: ${suffix}`);

        response = await fetch(TWITTER_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(altPayload)
        });

        responseBody = await response.json().catch(() => ({}));

        if (!response.ok) {
          const retryApiErrors = responseBody?.errors || null;
          let retryErr = responseBody?.detail || responseBody?.error || response.statusText || "Unknown error on retry.";
          if (Array.isArray(retryApiErrors) && retryApiErrors.length) {
            retryErr = retryApiErrors.map((e) => e?.detail || e?.message || JSON.stringify(e)).join(" | ");
          }
          throw new Error(`Twitter retry failed ${response.status}: ${retryErr}`);
        }

        return {
          id: responseBody?.data?.id,
          text: responseBody?.data?.text
        };
      } catch (retryError) {
        // bubble up the retry error
        throw retryError;
      }
    }

    throw new Error(`Twitter API error ${response.status}: ${errorMessage}`);
  }

  return {
    id: responseBody?.data?.id,
    text: responseBody?.data?.text
  };
}

function createAuthRequest() {
  if (!CLIENT_ID || !CALLBACK_URL) {
    throw new Error("TWITTER_CLIENT_ID and TWITTER_CALLBACK_URL must be set in .env");
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = crypto.randomBytes(16).toString("hex");
  const scope = encodeURIComponent("tweet.read tweet.write users.read offline.access");

  const authorizeUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
    CLIENT_ID
  )}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${scope}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  return {
    url: authorizeUrl,
    codeVerifier,
    state
  };
}

function clearAuthTokens() {
  saveTokens(null);
  console.log("[Twitter] Cleared stored OAuth tokens.");
}

module.exports = {
  postTweet,
  createAuthRequest,
  exchangeAuthCode,
  getAuthStatus,
  clearAuthTokens
};
