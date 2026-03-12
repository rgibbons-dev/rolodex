import QRCode from "qrcode";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * Generate a QR code PNG buffer for a user's profile URL.
 */
export async function generateProfileQR(handle: string): Promise<Buffer> {
  const url = `${BASE_URL}/@${handle}`;
  return QRCode.toBuffer(url, {
    type: "png",
    width: 512,
    margin: 2,
    color: {
      dark: "#1c1917", // stone-900
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}

/**
 * Generate a QR code as a data URL (base64) for embedding in HTML.
 */
export async function generateProfileQRDataURL(handle: string): Promise<string> {
  const url = `${BASE_URL}/@${handle}`;
  return QRCode.toDataURL(url, {
    width: 512,
    margin: 2,
    color: {
      dark: "#1c1917",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}
