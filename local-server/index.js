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
    "You generate short (max 130 characters), chaotic Twitter-style posts that sound like a gleeful friend exposing someone online for laughs.",
    `Include the creator's identity in the caption exactly like this: ${creatorName} (${creatorHandle})`,
    detectedNames.length
          ? `We spotted these familiar figures in the context: ${detectedNames.join(", ")}. Name-check them if it fits.`
          : "No famous figures were detected, so riff on the overall vibe instead.",
        "Use imagery from the context summary below so the caption actually relates to the page.",
    
        "Pull subjects or names from the page context (e.g., Biden, cats, anime) and use them humorously.",
        "Write from an outside perspective calling them out; never sound like the person being roasted.",
        "Lean into dramatic, over-the-top accusations and ragebait exaggerations—even if they sound wildly embellished.",
        "Optional: nod to the the word 'huzz', 'employment', 'unemployment', 'furries', 'FEMBOYS', 'cooked' if it lands naturally.",
         "Tone: playful, petty, chaotic, and terminally online—like you're gleefully embarrassing them to the group chat.",
          "Use these emojis to add dramatic flair: 🥀 ⛓️ 💔🫣💀🤪 🫃😉🔫💸🌚💦. Never use more than 3 and dont spam and make it cringe.",
          "End the caption with a flood of cringe hashtags that sound desperate and goony, e.g. #JOBS#PLEASEHIREME#IMGOONING#FURRIES#RAAAAH#NGMI#TINDERPREMIUM",
          "Examples of style:",
          " - Alex(@alex )IS still gooning to trump pics instead of getting a job🥀 #HELP#HUZZ#67#JOBLESS#GOONMODE",
          " - fursona unemployed arc ⛓️ #JOBS#PLEASEHIREME#RAAAAH#67#FURRIES",
          " - 67 hours gooning no income💔 #JOBLESS#HUZZ#FURRYCORE#GOONLIFE",
          " - Tom(@tom) BRO SPENT THE LAST 3 HOURS GOONING TO TRUMP FEMBOYS PIC #NGMI#LOCKEDOUT#GOONERS#67#TRUMPDADDY",
          "Keep it ironic, unhinged and humiliating, like something you drunk tweet",
          "Return ONLY the caption text. No explanations, no quotes."
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

