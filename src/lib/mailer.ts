import nodemailer from 'nodemailer';

export interface MailTransport {
  sendMail(options: { from: string; to: string; subject: string; html: string }): Promise<{ messageId?: string }>;
}

export function createTransport(config: {
  host: string;
  port: string;
  user: string;
  pass: string;
}): MailTransport {
  const port = Number(config.port);
  return nodemailer.createTransport({
    host: config.host,
    port,
    secure: port === 465,
    auth: { user: config.user, pass: config.pass },
  });
}

export async function sendMail(
  transport: MailTransport,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  await transport.sendMail({ from, to, subject, html });
}
