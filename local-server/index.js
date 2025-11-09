const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  postTweet,
  createAuthRequest,
  exchangeAuthCode,
  getAuthStatus,
  clearAuthTokens
} = require("./twitterClient");


const PORT = process.env.PORT || 5051;
const GEMINI_MODEL = "gemini-2.5-flash-lite";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

let latestSnapshot = null;
let pendingAuthRequest = null;

function buildSummary(snapshot = {}) {
  const pageTitle = snapshot?.page?.title || "Untitled page";
  const pageUrl = snapshot?.page?.url || "unknown url";
  const topImages = Array.isArray(snapshot?.topImages) ? snapshot.topImages.slice(0, 3) : [];
  const imageMeta = Array.isArray(snapshot?.imageMeta) ? snapshot.imageMeta.filter(Boolean).slice(0, 5) : [];
  const clicks = Array.isArray(snapshot?.clicks) ? snapshot.clicks.slice(0, 10) : [];
  const scrollDepth = Number(snapshot?.maxScrollDepth ?? 0);
  const creatorName = snapshot?.profile?.name || "Anonymous goon";
  const creatorHandle = snapshot?.profile?.handle || "@unknown67";
  const detectedNames = Array.isArray(snapshot?.detectedNames) ? snapshot.detectedNames.slice(0, 6) : [];
  const pageContext = snapshot?.pageContext || {};
  const headings = Array.isArray(pageContext.headings) ? pageContext.headings.slice(0, 5) : [];
  const description = pageContext.description || "";
  const excerpt = pageContext.excerpt || "";

  const sanitizedImages = imageMeta
    .filter((meta) => meta?.src && !/testdebug2\.jpg/i.test(meta.src))
    .map((meta, index) => {
      const detail = [meta.alt, meta.context].filter(Boolean).join(" -- ") || "no description";
      return `Image ${index + 1}: ${detail}`;
    });

  const lines = [
    `Creator: ${creatorName} (${creatorHandle})`,
    `Page title: ${pageTitle}`,
    `Page url: ${pageUrl}`,
    `Detected figures: ${detectedNames.length ? detectedNames.join(", ") : "none"}`,
    `Top image URLs: ${topImages.length ? topImages.join(" | ") : "none"}`,
    `Recent clicks: ${clicks.length ? clicks.join(" | ") : "none"}`,
    `Max scroll depth: ${scrollDepth}%`,
    `Headings: ${headings.length ? headings.join(" | ") : "none"}`,
    `Meta description: ${description || "n/a"}`,
    `Excerpt: ${excerpt || "n/a"}`
  ];

  if (sanitizedImages.length) {
    lines.push("Image descriptions:");
    sanitizedImages.forEach((text) => lines.push(` - ${text}`));
  }

  return {
    summary: lines.join("\n"),
    creatorName,
    creatorHandle,
    detectedNames
  };
}

async function generateCaption(apiKey, context) {
  const summary = context?.summary || "";
  const creatorName = context?.creatorName || "Anonymous goon";
  const creatorHandle = context?.creatorHandle || "@unknown67";
  const detectedNames = context?.detectedNames || [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = [
    "You generate short (max 130 characters), chaotic Twitter-style posts that sound like an unhinged LeBron James superfan spiraling online.",
    `Include the user's identity in the caption exactly like this: ${creatorName} (${creatorHandle})`,
    "Always tag @KingJames somewhere in the post.",
    "Start every post with: LEBRON YOU ARE MY SUNSHINE ☀️👑",
    "Use the variable {count} to show how many pictures were turned into LeBron faces.",
    "Use wild, meme-sounding fan vocabulary like KING, GOAT, HIM, LEGOD, BRON, WITNESS, etc.",
    "Tone: low-effort, emotional, delusional, and hopelessly devoted to LeBron.",
    "Make it read like a fan losing control after seeing LeBron everywhere.",
    "You can use emojis like 👑☀️🔥🏀💪😭🙏😩🌞 but never more than 3.",
    "End every post with absurd hashtags like #LeGoon #LeGod #BronOverEverything #WitnessGreatness #LeTruth #GOAT #KingJames.",
    "Examples:",
    ` - LEBRON YOU ARE MY SUNSHINE ☀️👑 ${creatorName} (${creatorHandle}) just GOONED TO {count} PICS OF THE GOAT 🔥🙏 @KingJames #LeGoon #BronOverEverything`,
    ` - LEBRON YOU ARE MY SUNSHINE ☀️👑 ${creatorName} (${creatorHandle}) SAW {count} IMAGES TURN INTO HIM 💪😭 @KingJames #LeGod #WitnessGreatness`,
    ` - LEBRON YOU ARE MY SUNSHINE ☀️👑 ${creatorName} (${creatorHandle}) GOONED THROUGH {count} PICS AND STILL CRAVES MORE 🔥 @KingJames #GOAT #LeTruth`,
    "Keep it delusional, funny, and loud. Return ONLY the caption text. No explanations, no quotes."
  ].join('\\n');
    
  const response = await model.generateContent([{ text: prompt }]);
  const rawText = response?.response?.text?.() || "";
  const cleaned = rawText.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    throw new Error("Model returned an empty caption.");
  }

  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned;
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/ingest", (req, res) => {
  latestSnapshot = req.body || null;
  res.json({ ok: true });
});

app.post("/generate", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "Missing GEMINI_API_KEY environment variable." });
  }

  const snapshot = Object.keys(req.body || {}).length ? req.body : latestSnapshot;
  const context = buildSummary(snapshot || {});

  let caption;
  let tweetResult = null;
  let tweetError = null;

  function sanitizeTweetInput(text = "") {
    if (typeof text !== "string") return "";
    // Remove control characters except common whitespace (tab/newline)
    // Replace CR and other invisibles with spaces, keep printable characters including quotes/braces
    const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ").trim();
    // Ensure max length 280 (Twitter limit)
    return cleaned.length > 280 ? cleaned.slice(0, 279) : cleaned;
  }

  try {
    caption = await generateCaption(apiKey, context);
  } catch (error) {
    console.error("[Caption Server] Failed to generate caption:", error);
    return res
      .status(500)
      .json({ error: "Failed to generate caption. Check server logs for details." });
  }

  if (req.body?.postToTwitter) {
    const override = typeof req.body?.tweetText === "string" ? req.body.tweetText : null;
    const rawTweetText = override?.trim().length ? override.trim() : caption;
    const tweetText = sanitizeTweetInput(rawTweetText);

    try {
      tweetResult = await postTweet(tweetText);
    } catch (error) {
      console.error("[Caption Server] Failed to post tweet:", error);
      tweetError =
        (error && error.message) || "Failed to post tweet. Check server logs for details.";
    }
  }

  res.json({
    caption,
    tweeted: Boolean(tweetResult),
    tweetId: tweetResult?.id || null,
    tweetText: tweetResult?.text || null,
    tweetError
  });
});

app.get("/auth/status", (_req, res) => {
  res.json(getAuthStatus());
});

app.get("/auth/start", (_req, res) => {
  try {
    pendingAuthRequest = createAuthRequest();
    res.redirect(pendingAuthRequest.url);
  } catch (error) {
    console.error("[Caption Server] Failed to start auth flow:", error);
    res
      .status(500)
      .send("Unable to start authorization flow. Check server logs for details.");
  }
});

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!pendingAuthRequest) {
    res.status(400).send("No authorization request is pending. Restart via /auth/start.");
    return;
  }

  if (!code || !state) {
    res.status(400).send("Missing authorization code or state parameter.");
    return;
  }

  if (state !== pendingAuthRequest.state) {
    pendingAuthRequest = null;
    res.status(400).send("State mismatch. Restart the authorization flow.");
    return;
  }

  try {
    await exchangeAuthCode(code, pendingAuthRequest.codeVerifier);
    pendingAuthRequest = null;
    res.send(
      "Authorization complete. You can close this tab and use the extension to post to X/Twitter."
    );
  } catch (error) {
    console.error("[Caption Server] Auth callback failed:", error);
    pendingAuthRequest = null;
    res.status(500).send(`Authorization failed: ${error.message}`);
  }
});

app.post("/auth/logout", (_req, res) => {
  clearAuthTokens();
  pendingAuthRequest = null;
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[Caption Server] Listening on port ${PORT}`);
  console.log("Health check: http://localhost:%d/health", PORT);
  console.log("Begin Twitter auth: http://localhost:%d/auth/start", PORT);
});

