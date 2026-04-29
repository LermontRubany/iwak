import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../uploads');
const catalogDir = path.join(uploadDir, 'catalog');
const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

await fs.mkdir(catalogDir, { recursive: true });

const entries = await fs.readdir(uploadDir, { withFileTypes: true });
let created = 0;
let skipped = 0;
let failed = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;
  const ext = path.extname(entry.name).toLowerCase();
  if (!imageExts.has(ext)) continue;

  const input = path.join(uploadDir, entry.name);
  const outputName = entry.name.replace(/\.(jpe?g|png|webp|avif)$/i, '.webp');
  const output = path.join(catalogDir, outputName);

  try {
    await fs.access(output);
    skipped += 1;
    continue;
  } catch {
    // create missing thumbnail
  }

  try {
    await sharp(input)
      .rotate()
      .resize({ width: 720, withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(output);
    created += 1;
  } catch (err) {
    failed += 1;
    console.warn(`[catalog-thumbs] skipped ${entry.name}: ${err.message}`);
  }
}

console.log(`[catalog-thumbs] created=${created} skipped=${skipped} failed=${failed}`);
