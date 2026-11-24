import nodemailer, { Transporter } from 'nodemailer';
import { Sender } from '@prisma/client';
import { logger } from '../config/logger';

const transporters = new Map<string, Transporter>();

export function getTransporter(sender: Sender): Transporter {
  let transporter = transporters.get(sender.id);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: {
        user: sender.smtpUser,
        pass: sender.smtpPass,
      },
    });
    transporters.set(sender.id, transporter);
  }
  return transporter;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function sendEmail(
  sender: Sender,
  to: string,
  subject: string,
  body: string,
  emailId: string
): Promise<{ messageId: string; previewUrl: string | null }> {
  const transporter = getTransporter(sender);
  const text = stripHtml(body);

  const info = await transporter.sendMail({
    from: `"${sender.displayName}" <${sender.email}>`,
    to,
    subject,
    html: body,
    text,
    messageId: `<${emailId}@sendora.local>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  const finalPreviewUrl = previewUrl ? previewUrl.toString() : null;

  logger.info(
    { emailId, to, sender: sender.email, messageId: info.messageId, previewUrl: finalPreviewUrl },
    'Email delivered via SMTP'
  );

  return {
    messageId: info.messageId,
    previewUrl: finalPreviewUrl,
  };
}
