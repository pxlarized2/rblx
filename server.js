const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// Simple rate limit: max 20 requests per IP per minute
const rateLimits = {};
function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimits[ip]) rateLimits[ip] = [];
  rateLimits[ip] = rateLimits[ip].filter(t => now - t < 60000);
  if (rateLimits[ip].length >= 20) return false;
  rateLimits[ip].push(now);
  return true;
}

app.post("/ask", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Slow down!" });
  }

  const { category, history } = req.body;

  if (!category || !history) {
    return res.status(400).json({ error: "Missing category or history." });
  }

  const validCategories = ["game", "item", "player"];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: "Invalid category." });
  }

  // Build the conversation for Claude
  const systemPrompt = `You are Robloxinator, an Akinator-style genie that guesses Roblox ${category}s.
The player is thinking of a famous Roblox ${category}.
- If category is "game": think of popular Roblox games like Blox Fruits, Adopt Me, Brookhaven, Tower of Hell, Jailbreak, Pet Simulator X, Arsenal, Murder Mystery 2, Piggy, Natural Disaster Survival, Work at a Pizza Place, MeepCity, Royale High, Doors, Funky Friday, etc.
- If category is "item": think of famous Roblox catalog items, limiteds, and accessories like Dominus Empyreus, Korblox Deathspeaker, Headless Horseman, Pal Hair, Clockwork Headphones, Valkyrie Helm, Winged Fedora, Bloxy Cola, linked sword, etc.
- If category is "player": think of famous Roblox YouTubers/streamers/creators like Flamingo (mrflimflam), Denis, Builderman (david.baszucki), Kreekcraft, Poke, Tofuu, Sketchy, Roblox (official account), etc.

Rules:
1. Ask ONE yes/no question at a time to narrow down what they're thinking of.
2. Ask smart, strategic questions that eliminate many possibilities at once.
3. After enough information (usually 10-20 questions), make a guess.
4. When guessing, respond ONLY in this exact JSON format: {"type":"guess","value":"NAME OF THING","reason":"brief reason"}
5. When asking a question, respond ONLY in this exact JSON format: {"type":"question","value":"Your yes/no question here?"}
6. If you're very confident after just a few questions, guess early.
7. Never repeat a question already asked.
8. Keep questions short and snappy — this is a fun game!
9. ONLY output valid JSON. No extra text, no markdown.`;

  // Convert history array to Claude messages
  const messages = history.map(h => ({
    role: h.role,
    content: h.content
  }));

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      return res.status(500).json({ error: "AI error, try again." });
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    // Validate it's JSON
    const parsed = JSON.parse(text);
    if (!parsed.type || !parsed.value) throw new Error("Bad format");

    return res.json(parsed);

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "Robloxinator proxy is running!" });
});

app.listen(PORT, () => {
  console.log(`Robloxinator proxy running on port ${PORT}`);
});
