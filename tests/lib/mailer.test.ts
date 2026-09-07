import { describe, it, expect, vi } from 'vitest';
import { sendMail, type MailTransport } from '../../src/lib/mailer';

describe('sendMail', () => {
  it('calls transport.sendMail with the given fields', async () => {
    const transport: MailTransport = {
      sendMail: vi.fn().mockResolvedValue({ messageId: 'abc' }),
    };
    await sendMail(transport, 'from@x.com', 'to@x.com', 'Sujet', '<p>Corps</p>');
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'from@x.com',
      to: 'to@x.com',
      subject: 'Sujet',
      html: '<p>Corps</p>',
    });
  });

  it('propagates a rejection from the transport', async () => {
    const transport: MailTransport = {
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP connection refused')),
    };
    await expect(
      sendMail(transport, 'from@x.com', 'to@x.com', 'Sujet', '<p>Corps</p>')
    ).rejects.toThrow('SMTP connection refused');
  });
});
