import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const target = "https://www.sneakycleantn.com/pop-up/";
const outputDir = path.join(process.cwd(), "assets", "images", "pop-up");

await fs.mkdir(outputDir, { recursive: true });

const options = {
  errorCorrectionLevel: "H",
  margin: 4,
  color: { dark: "#001210", light: "#ffffff" },
};

await QRCode.toFile(path.join(outputDir, "resident-pop-up-qr.png"), target, {
  ...options,
  width: 1600,
});
await QRCode.toFile(path.join(outputDir, "resident-pop-up-qr.svg"), target, {
  ...options,
  type: "svg",
});

console.log(`Generated resident QR for ${target}`);
