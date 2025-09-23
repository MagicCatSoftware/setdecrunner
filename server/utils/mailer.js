// utils/mailer.js
import { mailer, MAIL_FROM as CFG_APP_BASE_URL } from './config.js';

/**
 * Generic email sender.
 */

const APP_BASE_URL = process.env.APP_BASE_URL;

export async function sendMail({ to, subject, html, text, from = process.env.MAIL_FROM, headers }) {
  if (!to) throw new Error('sendMail: "to" is required');
  if (!subject) throw new Error('sendMail: "subject" is required');
  const msg = {
    from,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(headers ? { headers } : {}),
  };
  return mailer.sendMail(msg);
}

// Optional alias if you were calling sendMailer() elsewhere
export const sendMailer = sendMail;

/**
 * Sends a temporary password email.
 */
export async function sendTempPasswordEmail({
  to,
  name = '',
  tempPassword,
  productionTitle = 'your account',
  loginPath = '/login',
}) {
  if (!to) throw new Error('sendTempPasswordEmail: "to" is required');
  if (!tempPassword) throw new Error('sendTempPasswordEmail: "tempPassword" is required');

  const base = CFG_APP_BASE_URL || process.env.APP_BASE_URL || '';
  const loginUrl = `${base}${loginPath}`;

  const subject = `Your ${productionTitle} is ready — temporary password inside`;
  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height:1.5;">
      <h2 style="margin:0 0 12px;">Welcome${name ? `, ${name}` : ''}!</h2>
      <p>We've set up your account${productionTitle ? ` for <strong>${productionTitle}</strong>` : ''}.</p>
      <p><strong>Temporary password:</strong></p>
      <pre style="background:#f5f5f7;padding:12px;border-radius:8px;display:inline-block;">${tempPassword}</pre>
      <p>Please sign in and change it right away:</p>
      <p><a href="${loginUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">Sign in</a></p>
      <p style="color:#666;font-size:13px;margin-top:18px;">
        If you didn’t expect this email, you can ignore it.
      </p>
    </div>
  `;

  const text = `Welcome${name ? `, ${name}` : ''}!
  
Temporary password: ${tempPassword}

Sign in: ${loginUrl}

For security, please change it right away.`;

  return sendMail({ to, subject, html, text });
}

export default mailer;

