// Regenerate all app icons from public/logo.svg (the Prixes mark).
// Run: node scripts/gen-icons.cjs
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "public/logo.svg"));
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function iconOnWhite(size, innerFrac, out, radius = 0) {
  const inner = Math.round(size * innerFrac);
  const mark = await sharp(svg).resize(inner, inner, { fit: "contain" }).png().toBuffer();
  let base = sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  });
  const layers = [{ input: mark, gravity: "center" }];
  if (radius > 0) {
    const r = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`
    );
    // Round the corners via a mask composite at the end.
    const flat = await base.composite(layers).png().toBuffer();
    await sharp(flat)
      .composite([{ input: r, blend: "dest-in" }])
      .png()
      .toFile(out);
    return;
  }
  await base.composite(layers).png().toFile(out);
}

(async () => {
  await iconOnWhite(192, 0.8, path.join(ROOT, "public/icons/icon-192.png"));
  await iconOnWhite(512, 0.8, path.join(ROOT, "public/icons/icon-512.png"));
  // Maskable: extra padding so nothing is clipped inside the platform safe zone.
  await iconOnWhite(512, 0.6, path.join(ROOT, "public/icons/icon-maskable.png"));
  await iconOnWhite(180, 0.78, path.join(ROOT, "public/apple-touch-icon.png"));
  await iconOnWhite(48, 0.86, path.join(ROOT, "public/favicon-48.png"), 8);
  // Native (Capacitor) source used by `npm run cap:assets`.
  await iconOnWhite(1024, 0.72, path.join(ROOT, "assets/logo.png"));
  await iconOnWhite(1024, 0.72, path.join(ROOT, "assets/logo-dark.png"));
  console.log("icons regenerated");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
