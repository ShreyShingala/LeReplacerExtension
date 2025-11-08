const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const PORT = process.env.PORT || 5051;
const GEMINI_MODEL = "gemini-2.5-flash-lite";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

let latestSnapshot = null;

function buildSummary(snapshot = {}) {
  const pageTitle = snapshot?.page?.title || "Untitled page";
  const pageUrl = snapshot?.page?.url || "unknown url";
  const topImages = Array.isArray(snapshot?.topImages) ? snapshot.topImages.slice(0, 3) : [];
  const clicks = Array.isArray(snapshot?.clicks) ? snapshot.clicks.slice(0, 10) : [];
  const scrollDepth = Number(snapshot?.maxScrollDepth ?? 0);
  const creatorName = snapshot?.profile?.name || "Anonymous goon";
  const creatorHandle = snapshot?.profile?.handle || "@unknown67";

  const lines = [
    `Creator: ${creatorName} (${creatorHandle})`,
    `Page title: ${pageTitle}`,
    `Page url: ${pageUrl}`,
    `Top image URLs: ${topImages.length ? topImages.join(" | ") : "none"}`,
    `Recent clicks: ${clicks.length ? clicks.join(" | ") : "none"}`,
    `Max scroll depth: ${scrollDepth}%`
  ];

  return {
    summary: lines.join("\n"),
    creatorName,
    creatorHandle
  };
}

async function generateCaption(apiKey, context) {
  const summary = context?.summary || "";
  const creatorName = context?.creatorName || "Anonymous goon";
  const creatorHandle = context?.creatorHandle || "@unknown67";

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

  try {
    const caption = await generateCaption(apiKey, context);
    res.json({ caption });
  } catch (error) {
    console.error("[Caption Server] Failed to generate caption:", error);
    res.status(500).json({ error: "Failed to generate caption. Check server logs for details." });
  }
});

app.listen(PORT, () => {
  console.log(`[Caption Server] Listening on port ${PORT}`);
});

