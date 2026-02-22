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
    // Stub: log to console instead of sending
    console.log("──────────────────────────────────────");
    console.log("📧 EMAIL STUB (would send in production)");
    console.log(`   To:      ${options.to}`);
    console.log(`   Subject: ${options.subject}`);
    console.log(`   Body:    ${options.text}`);
    console.log("──────────────────────────────────────");
  },
};
