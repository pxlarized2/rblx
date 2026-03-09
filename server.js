const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 8080;

// Rate limit: 20 requests per IP per minute
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
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Too many requests." });

  const { category, history } = req.body;
  if (!category || !history) return res.status(400).json({ error: "Missing fields." });
  if (!["game", "item", "player"].includes(category)) return res.status(400).json({ error: "Invalid category." });

  const systemPrompt = `You are Robloxinator, an Akinator-style genie that guesses Roblox ${category}s through yes/no questions.

The player is thinking of a famous Roblox ${category}.
- game: Blox Fruits, Adopt Me, Brookhaven, Tower of Hell, Jailbreak, Pet Simulator X, Arsenal, Murder Mystery 2, Piggy, Natural Disaster Survival, Work at a Pizza Place, MeepCity, Royale High, Doors, Funky Friday, etc.
- item: Dominus Empyreus, Korblox Deathspeaker, Headless Horseman, Pal Hair, Clockwork Headphones, Valkyrie Helm, Winged Fedora, Bloxy Cola, Linked Sword, etc.
- player: Flamingo (mrflimflam), Denis, Builderman (david.baszucki), KreekCraft, Poke, Tofuu, Roblox official account, etc.

STRICT RULES:
1. Ask ONE yes/no question at a time to narrow down possibilities.
2. Ask smart strategic questions that eliminate many options at once.
3. When confident (usually 8-18 questions), make a guess.
4. For a QUESTION respond ONLY with this exact JSON:
   {"type":"question","value":"Your yes/no question here?"}
5. For a GUESS respond ONLY with this exact JSON:
   {"type":"guess","value":"EXACT NAME","reason":"one sentence why","description":"2-3 sentence paragraph about this Roblox ${category} — what it is, why it's famous, interesting facts. Write in an engaging tone."}
6. The "description" field should be 2-3 sentences, engaging and informative.
7. ONLY output valid JSON. No extra text, no markdown backticks.
8. Never repeat a question already asked.`;

  const messages = history.map(h => ({ role: h.role, content: h.content }));

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
        max_tokens: 300,
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      return res.status(500).json({ error: "AI error." });
    }

    const data = await response.json();
    let text = data.content[0].text.trim();
    // Strip markdown code fences if Claude added them
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    console.log("Claude response:", text);
    const parsed = JSON.parse(text);
    if (!parsed.type || !parsed.value) throw new Error("Bad format");
    return res.json(parsed);

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/", (req, res) => res.json({ status: "Robloxinator running!" }));

app.listen(PORT, () => console.log(`Robloxinator proxy on port ${PORT}`));
