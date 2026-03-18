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
