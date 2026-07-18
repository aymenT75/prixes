// Regenerate all app icons from public/logo-mark.png (the Prixes cart mark,
// cropped square from the user-supplied artwork — see public/logo-new.png).
// Run: node scripts/gen-icons.cjs
const sharp = require("sharp");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public/logo-mark.png");
// Dominant corner colour of the artwork's gradient — used as the maskable
// icon's edge-to-edge background so the source's white corner bleed (from
// cropping a rounded shape out of a square photo) never shows through.
const BG = { r: 0xa9, g: 0xe0, b: 0x34, alpha: 1 };

/** Resize the mark to fill `size`, then clip rounded corners (radius as a
 * fraction of size) so no white corner-bleed from the source crop shows. */
async function roundedIcon(size, radiusFrac, out) {
  const mark = await sharp(SRC).resize(size, size, { fit: "cover" }).png().toBuffer();
  const r = Math.round(size * radiusFrac);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  );
  await sharp(mark).composite([{ input: mask, blend: "dest-in" }]).png().toFile(out);
}

/** Maskable icon: full-bleed background (no rounding — the OS defines the
 * mask shape), mark scaled down so its content stays inside the safe zone. */
async function maskableIcon(size, innerFrac, out) {
  const inner = Math.round(size * innerFrac);
  const mark = await sharp(SRC).resize(inner, inner, { fit: "contain" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(out);
}

(async () => {
  await roundedIcon(192, 0.2, path.join(ROOT, "public/icons/icon-192.png"));
  await roundedIcon(512, 0.2, path.join(ROOT, "public/icons/icon-512.png"));
  await maskableIcon(512, 0.72, path.join(ROOT, "public/icons/icon-maskable.png"));
  await roundedIcon(180, 0.2, path.join(ROOT, "public/apple-touch-icon.png"));
  await roundedIcon(48, 0.2, path.join(ROOT, "public/favicon-48.png"));
  // Native (Capacitor) source used by `npm run cap:assets`.
  await roundedIcon(1024, 0.2, path.join(ROOT, "assets/logo.png"));
  await roundedIcon(1024, 0.2, path.join(ROOT, "assets/logo-dark.png"));
  console.log("icons regenerated");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
