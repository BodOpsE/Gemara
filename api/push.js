const webpush = require('web-push');

const SUPABASE_URL = "https://goyhoiyqyxajkmscnvpd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdveWhvaXlxeXhhamttc2NudnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjEyNjIsImV4cCI6MjA4NzA5NzI2Mn0.-9-YlMhvjsJYbX5NBs5QKm7lBgUcGE88h4upAJrI8q0";

const VAPID_PUBLIC = "BHDD4StYlN8Vh3WsUHBZXdqaovQESfpMOSVsK1bAmwEdGkKBjYk5PA1Xd0thraIeYtUnN5tk-udL2lDPwHYwdn0";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "OcbcQi51yHG5z0OxR8slvBd5H53yRw5od8xkz4hD_Tc";

webpush.setVapidDetails('mailto:push@gemara.live', VAPID_PUBLIC, VAPID_PRIVATE);

// EST helpers
function estNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function todayKey() {
  const d = estNow();
  return d.toISOString().slice(0, 10);
}

// Messages for each check-in time
const MESSAGES = {
  13: "Quick reminder — you haven't learned today yet. 5 minutes is all it takes!",
  17: "Afternoon check-in: today's learning is still waiting for you 📖",
  21: "Last call — don't break your streak! A quick session before bed?"
};

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || '',
      ...(opts.headers || {})
    }
  });
  if (!r.ok) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const now = estNow();
    const hour = now.getHours();
    
    // Only send at 1 PM, 5 PM, 9 PM EST (allow ±30 min window)
    const targetHour = [13, 17, 21].find(h => Math.abs(hour - h) === 0);
    if (!targetHour && !req.query.force) {
      return res.status(200).json({ status: 'skipped', reason: `EST hour is ${hour}, not a notification hour` });
    }
    const sendHour = targetHour || hour;

    const today = todayKey();

    // Check if today is Shabbos/YT (day of week: 6 = Saturday)
    const dow = now.getDay();
    if (dow === 6) {
      return res.status(200).json({ status: 'skipped', reason: 'Shabbos' });
    }

    // Get all push subscriptions
    const subs = await sbFetch('push_subs?select=*');
    if (!subs || subs.length === 0) {
      return res.status(200).json({ status: 'skipped', reason: 'no subscriptions' });
    }

    let sent = 0, skipped = 0, failed = 0;

    for (const sub of subs) {
      // Check if this user already completed today
      const progress = await sbFetch(`progress?pass_key=eq.${sub.pass_key}&select=calendar`);
      if (progress && progress.length > 0) {
        const cal = progress[0].calendar;
        if (cal && typeof cal === 'object' && cal.days && cal.days[today] && cal.days[today].ok) {
          skipped++;
          continue; // Already done today
        }
      }

      // Send push
      try {
        const payload = JSON.stringify({
          title: 'דַּף הַיּוֹמִי',
          body: MESSAGES[sendHour] || MESSAGES[21],
          icon: '/icon-192.png',
          url: '/'
        });
        await webpush.sendNotification(JSON.parse(sub.subscription), payload);
        sent++;
      } catch (err) {
        console.error('Push failed for', sub.pass_key, err.statusCode || err.message);
        // If subscription expired (410), delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sbFetch(`push_subs?id=eq.${sub.id}`, { method: 'DELETE' });
        }
        failed++;
      }
    }

    return res.status(200).json({ status: 'ok', today, hour: sendHour, sent, skipped, failed });
  } catch (err) {
    console.error('Push cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
