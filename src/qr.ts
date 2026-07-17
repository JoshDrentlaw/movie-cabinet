import QRCode from "qrcode";

/** Render the given URL as an SVG QR code (string). */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
  }) as Promise<string>;
}
