module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { weakWords, stats } = req.body;

    const prompt = `You are analyzing a Gemara vocabulary student's weak spots. Here is their data:

OVERALL STATS:
- Total words seen: ${stats.seen}/${stats.total}
- Mastered (level 4+): ${stats.mastered}
- Streak: ${stats.streak} days

WEAK WORDS (level 0-2, or high incorrect count):
${weakWords.map(w => `- ${w.hebrew} (${w.transliteration}) = "${w.english}" | Track: ${w.track} | Category: ${w.cat} | Correct: ${w.correct}, Wrong: ${w.incorrect}, Level: ${w.level}`).join('\n')}

Based on this data, give a SHORT coaching response (4-6 sentences max):
1. Identify the PATTERN in their weak spots (is it a category? a track? certain word types?)
2. Give ONE specific, actionable tip to improve
3. Pick the 2-3 most important words they should focus on and give a quick memory trick for each

Be warm and encouraging like a chavrusa. Use transliterations.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: "You are a Gemara vocabulary coach for a frum yeshiva student learning Masechet Avodah Zarah. Be concise, warm, and actionable. Use Ashkenazi transliterations.",
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = (data.content || []).map(b => b.text || '').join('');
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
