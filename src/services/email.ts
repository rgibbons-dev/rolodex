/**
 * Email service — stubs email sending with console output.
 *
 * In production, swap this for SendGrid, Resend, Postmark, or SES.
 */

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const email = {
  async send(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      // In production, replace this stub with a real email service.
      // Never log email body — it may contain magic link tokens.
      console.log(`📧 Email sent to ${options.to}: ${options.subject}`);
      return;
    }

    // Development stub: log full email to console
    console.log("──────────────────────────────────────");
    console.log("📧 EMAIL STUB (would send in production)");
    console.log(`   To:      ${options.to}`);
    console.log(`   Subject: ${options.subject}`);
    console.log(`   Body:    ${options.text}`);
    console.log("──────────────────────────────────────");
  },
};
