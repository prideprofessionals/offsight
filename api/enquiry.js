// Booking enquiry form handler: emails the enquiry to the bookings inbox via Resend.
// Needs RESEND_API_KEY in Vercel env vars, and offsight.au verified in Resend.
const TO = process.env.ENQUIRY_TO || 'bookings@offsight.au';
const FROM = process.env.ENQUIRY_FROM || 'offsight. enquiries <enquiries@offsight.au>';

const FIELDS = [
  ['name', 'Name'], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone'],
  ['space', 'Space'], ['layout', 'Layout'], ['guests', 'Guests'], ['date', 'Preferred date'],
  ['duration', 'Duration'], ['catering', 'Catering'], ['message', 'Message'],
];

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const back = (res, status) => { res.writeHead(303, { Location: `/?enquiry=${status}#book` }); res.end(); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return back(res, 'error');

  const body = req.body || {};
  const data = {};
  for (const [key] of FIELDS) data[key] = String(body[key] ?? '').trim().slice(0, key === 'message' ? 4000 : 200);

  // honeypot: real people never see this field
  if (body.website) return back(res, 'sent');
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return back(res, 'error');

  const rows = FIELDS.filter(([k]) => data[k])
    .map(([k, label]) => `<tr><td style="padding:6px 16px 6px 0;color:#6b6d68;vertical-align:top">${label}</td><td style="padding:6px 0;color:#2b2d28;white-space:pre-wrap">${esc(data[k])}</td></tr>`)
    .join('');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: data.email,
      subject: `Enquiry: ${data.space || 'offsight.'}${data.date ? ' on ' + data.date : ''} – ${data.name}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px"><h2 style="color:#2b2d28;font-weight:500">New booking enquiry</h2><table>${rows}</table><p style="color:#6b6d68;font-size:13px">Reply to this email to respond to ${esc(data.name)} directly.</p></div>`,
      text: FIELDS.filter(([k]) => data[k]).map(([k, label]) => `${label}: ${data[k]}`).join('\n'),
    }),
  }).catch(() => null);

  if (!r || !r.ok) {
    console.error('Resend failed', r && r.status, r && await r.text());
    return back(res, 'error');
  }
  back(res, 'sent');
};
