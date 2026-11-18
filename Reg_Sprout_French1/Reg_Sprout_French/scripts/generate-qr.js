/**
 * Free Production QR Code Generator
 * 
 * Generates high-resolution, print-ready QR codes pointing to the final production URL.
 * - Free: Uses the local 'qrcode' library, zero external APIs, zero cost.
 * - Suitable for posters, brochures, banners, and digital display.
 * - Generates both 2048x2048 PNG (with white quiet zone / margin) and scalable vector SVG.
 * 
 * Usage:
 *   node scripts/generate-qr.js [URL]
 * 
 * Example:
 *   npm run generate-qr -- https://votre-projet.web.app/registration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect project root & output directory
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Determine target production URL
let targetUrl = process.argv[2];

if (!targetUrl) {
  // Try reading from .env if available
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/VITE_FIREBASE_PROJECT_ID\s*=\s*(.+)/);
    if (match && match[1] && !match[1].includes('votre-projet')) {
      const projectId = match[1].trim();
      targetUrl = `https://${projectId}.web.app/registration`;
    }
  }
}

// Fallback to placeholder instruction URL if none provided
if (!targetUrl) {
  targetUrl = 'https://votre-projet.web.app/registration';
  console.log(`\x1b[33m[Information] Aucune URL spécifiée. Utilisation de l'URL par défaut : ${targetUrl}\x1b[0m`);
  console.log(`\x1b[36mConseil : Vous pouvez spécifier votre URL en exécutant :\x1b[0m`);
  console.log(`  npm run generate-qr -- https://<votre-id-projet>.web.app/registration\n`);
}

// Prevent localhost or 127.0.0.1 per specification
if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
  console.error('\x1b[31m[Erreur] Le QR code ne doit PAS pointer vers localhost ou 127.0.0.1 !\x1b[0m');
  console.error('Veuillez fournir une URL de production Firebase valide (ex: https://<projet>.web.app/registration).');
  process.exit(1);
}

console.log(`Génération des QR codes pour l'URL de production : \x1b[32m${targetUrl}\x1b[0m`);

async function generateQRCodes() {
  try {
    const pngPath = path.join(outputDir, 'qr-code.png');
    const svgPath = path.join(outputDir, 'qr-code.svg');

    // 1. Generate High-Resolution 2048x2048 PNG (Print-Ready for Posters & Flyers)
    await QRCode.toFile(pngPath, targetUrl, {
      errorCorrectionLevel: 'H', // Highest error correction (30% redundancy)
      type: 'png',
      width: 2048,
      margin: 4, // Clean white border / quiet zone
      color: {
        dark: '#0f172a',  // Professional slate dark
        light: '#ffffff', // Crisp white background
      },
    });
    console.log(`✔ PNG haute résolution (2048x2048) généré : ${pngPath}`);

    // 2. Generate Infinite-Resolution Scalable Vector SVG (Best for large brochures/print)
    const svgString = await QRCode.toString(targetUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 4,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    fs.writeFileSync(svgPath, svgString);
    console.log(`✔ SVG vectoriel pour impression grand format généré : ${svgPath}`);

    console.log('\n\x1b[32m[Succès] Les QR codes de production ont été créés avec succès dans le dossier public/.\x1b[0m');
  } catch (err) {
    console.error('\x1b[31m[Erreur] Échec de la génération du QR code :\x1b[0m', err);
    process.exit(1);
  }
}

generateQRCodes();
