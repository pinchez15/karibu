import 'server-only'
import QRCode from 'qrcode'

/** QR as inline SVG markup: no image request, sharp at any print size. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0E1530', light: '#FFFFFF' } })
}
