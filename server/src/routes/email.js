import { Router } from 'express';
import { Resend } from 'resend';

export const emailRoutes = Router();

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@therunhub.fit';
const APP_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

// POST /api/email/welcome — send branded welcome email (no auth required)
emailRoutes.post('/welcome', async (req, res) => {
  const { email, full_name } = req.body;

  if (!email || !full_name) {
    return res.status(400).json({ message: 'email and full_name required' });
  }

  const resend = getResend();
  if (!resend) {
    console.log('RESEND_API_KEY not set, skipping welcome email');
    return res.json({ success: true, emailSkipped: true });
  }

  try {
    await resend.emails.send({
      from: `The Run Hub <${FROM_EMAIL}>`,
      to: email,
      subject: 'Welcome to The Run Hub',
      html: buildWelcomeHtml(full_name),
    });

    console.log(`Welcome email sent to ${email}`);
    res.json({ success: true });
  } catch (err) {
    // Log but don't block registration
    console.error('Failed to send welcome email:', err.message);
    res.json({ success: true, emailSkipped: true });
  }
});

export async function sendWeeklySummaryEmail(summaries) {
  const resend = getResend();
  const coachEmail = process.env.COACH_EMAIL || 'jbuenojr@gmail.com';
  if (!resend) {
    console.log('RESEND_API_KEY not set, skipping weekly summary email');
    return;
  }

  const weekLabel = summaries[0]?.week_start
    ? new Date(summaries[0].week_start + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  try {
    await resend.emails.send({
      from: `The Run Hub <${FROM_EMAIL}>`,
      to: coachEmail,
      subject: `The Run Hub — Weekly Summary ${weekLabel}`,
      html: buildWeeklySummaryHtml(summaries, weekLabel),
    });
    console.log(`Weekly summary email sent to ${coachEmail} for ${summaries.length} athletes`);
  } catch (err) {
    console.error('Failed to send weekly summary email:', err.message);
  }
}

function formatPaceEmail(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return null;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60).toString().padStart(2, '0');
  return `${min}:${sec}/km`;
}

function acwrEmoji(zone) {
  if (zone === 'green') return '🟢';
  if (zone === 'yellow') return '🟡';
  if (zone === 'red') return '🔴';
  return '⚪';
}

function celebrationLabel(c) {
  if (c.type === 'first_workout') return '🎉 First workout ever!';
  if (c.type === 'longest_run') return `🏃 Longest run ever: ${c.value_km} km`;
  if (c.type === 'best_pace') return `⚡ Best pace ever: ${formatPaceEmail(c.value_sec_km)}/km`;
  if (c.type === 'perfect_week') return '💯 Perfect week — 100% adherence';
  return '';
}

function buildAthleteSection(s) {
  const adherencePct = s.adherence.percent !== null ? `${s.adherence.percent}%` : '—';
  const adherenceColor = s.adherence.percent === 100 ? '#CCFF00' :
    s.adherence.percent >= 70 ? '#FFCC00' : '#FF4444';

  const runsHtml = s.completed_runs.length === 0
    ? `<p style="color:#666;font-size:13px;margin:8px 0;">No completed workouts this week.</p>`
    : s.completed_runs.map(r => {
        const distActual = r.actual_distance_km != null ? `${r.actual_distance_km} km` : '—';
        const distPlan = r.planned_distance_km != null ? `${r.planned_distance_km} km` : '—';
        const paceActual = formatPaceEmail(r.actual_pace_sec_km) || '—';
        const pacePlan = formatPaceEmail(r.planned_pace_sec_km) || '—';
        const hr = r.actual_avg_hr ? `${r.actual_avg_hr} bpm` : '—';
        const rpe = r.rpe ? `${r.rpe}/10` : '—';
        return `
        <div style="border-left:3px solid #CCFF00;padding:8px 14px;margin:8px 0;background:#0a0a0a;">
          <div style="color:#ffffff;font-weight:700;font-size:13px;margin-bottom:4px;">${r.title || r.type}</div>
          <table cellpadding="0" cellspacing="0" style="font-size:12px;color:#888888;">
            <tr>
              <td style="padding-right:16px;">📏 <span style="color:#cccccc;">${distActual}</span> <span style="color:#555;">(plan ${distPlan})</span></td>
              <td style="padding-right:16px;">⏱ <span style="color:#cccccc;">${paceActual}/km</span> <span style="color:#555;">(plan ${pacePlan}/km)</span></td>
            </tr>
            <tr style="margin-top:4px;">
              <td style="padding-right:16px;padding-top:4px;">❤️ HR: <span style="color:#cccccc;">${hr}</span></td>
              <td style="padding-top:4px;">💪 RPE: <span style="color:#cccccc;">${rpe}</span></td>
            </tr>
          </table>
        </div>`;
      }).join('');

  const metricsHtml = `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:16px;">
      <tr>
        <td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1a1a1a;width:33%;">
          <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">RPE AVG</div>
          <div style="font-size:18px;font-weight:700;color:#ffffff;">${s.avg_rpe != null ? s.avg_rpe : '—'}<span style="font-size:11px;color:#555;">/10</span></div>
        </td>
        <td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1a1a1a;width:33%;">
          <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">ACWR</div>
          <div style="font-size:18px;font-weight:700;color:#ffffff;">
            ${acwrEmoji(s.acwr?.zone)} ${s.acwr?.insufficient_data ? 'N/A' : (s.acwr?.ratio ?? '—')}
          </div>
        </td>
        <td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1a1a1a;width:33%;">
          <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">ADHERENCE</div>
          <div style="font-size:18px;font-weight:700;color:${adherenceColor};">${s.adherence.completed}/${s.adherence.planned} <span style="font-size:12px;">(${adherencePct})</span></div>
        </td>
      </tr>
    </table>`;

  const painHtml = s.pain_flags.length > 0
    ? `<div style="margin-top:12px;padding:10px 14px;background:#1a0000;border:1px solid #440000;">
        <span style="font-size:11px;color:#ff4444;text-transform:uppercase;letter-spacing:1px;font-weight:700;">⚠ Pain Reported</span>
        <span style="font-size:12px;color:#cc9999;margin-left:8px;">${[...new Set(s.pain_flags.map(p => p.pain_location).filter(Boolean))].join(', ') || 'unspecified location'}</span>
      </div>`
    : '';

  const celebHtml = s.celebrations.length > 0
    ? `<div style="margin-top:12px;padding:12px 14px;background:#0d1a00;border:1px solid #CCFF00;">
        ${s.celebrations.map(c => `<div style="font-size:13px;color:#CCFF00;font-weight:700;margin-bottom:2px;">${celebrationLabel(c)}</div>`).join('')}
      </div>`
    : '';

  return `
    <tr><td style="padding:4px 0;">
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#111111;border:1px solid #222222;margin-bottom:16px;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #1a1a1a;">
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">
            ${s.name || 'Athlete'}
          </h2>
          <p style="margin:4px 0 0;font-size:12px;color:#555;">${s.email || ''} &mdash; Week of ${s.week_start}</p>
        </td></tr>
        <tr><td style="padding:20px 24px;">
          ${runsHtml}
          ${metricsHtml}
          ${painHtml}
          ${celebHtml}
        </td></tr>
      </table>
    </td></tr>`;
}

function buildWeeklySummaryHtml(summaries, weekLabel) {
  const athleteSections = summaries.map(buildAthleteSection).join('');
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#000000;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 20px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;">

        <tr><td style="padding:0 0 24px 0;">
          <span style="font-size:24px;font-weight:900;color:#CCFF00;letter-spacing:4px;text-transform:uppercase;">&#9889; THE RUN HUB</span>
        </td></tr>

        <tr><td style="padding:0 0 24px 0;">
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;">Weekly Summary</h1>
          <p style="margin:6px 0 0;font-size:14px;color:#555555;text-transform:uppercase;letter-spacing:2px;">${weekLabel}</p>
        </td></tr>

        ${athleteSections}

        <tr><td style="padding:32px 0 0 0;">
          <p style="margin:0;font-size:12px;color:#333333;letter-spacing:1px;text-transform:uppercase;">
            The Run Hub &mdash; Personalized Training Plans
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPlanPublishedEmail({ email, athleteName, planName }) {
  const resend = getResend();
  if (!resend) {
    console.log('RESEND_API_KEY not set, skipping plan published email');
    return;
  }
  try {
    await resend.emails.send({
      from: `The Run Hub <${FROM_EMAIL}>`,
      to: email,
      subject: 'Your training plan has been updated',
      html: buildPlanPublishedHtml(athleteName, planName),
    });
    console.log(`Plan published email sent to ${email}`);
  } catch (err) {
    console.error('Failed to send plan published email:', err.message);
  }
}

function buildPlanPublishedHtml(name, planName) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#000000;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <!-- Logo -->
        <tr><td style="padding:0 0 32px 0;">
          <span style="font-size:28px;font-weight:900;color:#CCFF00;letter-spacing:4px;text-transform:uppercase;">
            &#9889; THE RUN HUB
          </span>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background-color:#111111;border:1px solid #222222;padding:40px;">
          <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#FFFFFF;">
            Your plan is ready, ${name}!
          </h1>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#999999;">
            Your coach has published${planName ? ` <strong style="color:#FFFFFF;">${planName}</strong>` : ' a new training plan'} for you. Log in to view your workouts and get started.
          </p>

          <!-- CTA Button -->
          <a href="${APP_URL}/my-plan"
             style="display:inline-block;background-color:#CCFF00;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;letter-spacing:2px;text-transform:uppercase;">
            VIEW YOUR PLAN
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:32px 0 0 0;">
          <p style="margin:0;font-size:12px;color:#555555;letter-spacing:1px;text-transform:uppercase;">
            The Run Hub &mdash; Personalized Training Plans
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWelcomeHtml(name) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#000000;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <!-- Logo -->
        <tr><td style="padding:0 0 32px 0;">
          <span style="font-size:28px;font-weight:900;color:#CCFF00;letter-spacing:4px;text-transform:uppercase;">
            &#9889; THE RUN HUB
          </span>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background-color:#111111;border:1px solid #222222;padding:40px;">
          <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#FFFFFF;">
            Welcome, ${name}!
          </h1>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#999999;">
            Your account is ready. Your coach will review your profile and create your personalized training plan.
          </p>
          <p style="margin:0 0 32px 0;font-size:16px;line-height:1.6;color:#999999;">
            To get started, complete your onboarding profile so your coach has all the information needed to build the perfect plan for you.
          </p>

          <!-- CTA Button -->
          <a href="${APP_URL}/login"
             style="display:inline-block;background-color:#CCFF00;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;letter-spacing:2px;text-transform:uppercase;">
            COMPLETE YOUR PROFILE
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:32px 0 0 0;">
          <p style="margin:0;font-size:12px;color:#555555;letter-spacing:1px;text-transform:uppercase;">
            The Run Hub &mdash; Personalized Training Plans
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
