import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC_DIR = path.resolve('public')
const MAX_DIMENSION = 1200
const SIZE_THRESHOLD_BYTES = 600 * 1024
const SILHOUETTE_MAX_DIMENSION = 720
const SILHOUETTE_REGEX = /silhouette\.png$/i
const EXCLUDED_FILES = new Set([
  'public/icon-192.png',
  'public/icon-512.png',
  'public/apple-touch-icon.png',
  'public/fit-icon-ios.png',
])

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return fullPath
  }))
  return files.flat()
}

function toPublicRelative(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/')
}

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`
}

async function compressImage(filePath) {
  const relativePath = toPublicRelative(filePath)
  if (EXCLUDED_FILES.has(relativePath)) return null

  const originalBuffer = await fs.readFile(filePath)
  if (originalBuffer.byteLength < SIZE_THRESHOLD_BYTES) return null

  const image = sharp(originalBuffer, { animated: false })
  const metadata = await image.metadata()
  const largestSide = Math.max(metadata.width || 0, metadata.height || 0)

  let pipeline = sharp(originalBuffer, { animated: false }).rotate()
  if (largestSide > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  const outputBuffer = await pipeline
    .png({
      compressionLevel: 9,
      effort: 10,
      palette: true,
      quality: 85,
    })
    .toBuffer()

  if (outputBuffer.byteLength >= originalBuffer.byteLength) return null

  await fs.writeFile(filePath, outputBuffer)
  return {
    relativePath,
    width: metadata.width,
    height: metadata.height,
    before: originalBuffer.byteLength,
    after: outputBuffer.byteLength,
  }
}

async function createSilhouetteVariant(filePath) {
  const relativePath = toPublicRelative(filePath)
  if (!SILHOUETTE_REGEX.test(relativePath)) return null

  const originalBuffer = await fs.readFile(filePath)
  const image = sharp(originalBuffer, { animated: false })
  const metadata = await image.metadata()
  const largestSide = Math.max(metadata.width || 0, metadata.height || 0)

  let pipeline = sharp(originalBuffer, { animated: false }).rotate()
  if (largestSide > SILHOUETTE_MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: SILHOUETTE_MAX_DIMENSION,
      height: SILHOUETTE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  const outputBuffer = await pipeline
    .webp({
      quality: 82,
      effort: 6,
      alphaQuality: 85,
    })
    .toBuffer()

  const outputPath = filePath.replace(/\.png$/i, '.webp')
  await fs.writeFile(outputPath, outputBuffer)

  return {
    relativePath: toPublicRelative(outputPath),
    sourcePath: relativePath,
    width: metadata.width,
    height: metadata.height,
    before: originalBuffer.byteLength,
    after: outputBuffer.byteLength,
  }
}

async function main() {
  const allFiles = await walk(PUBLIC_DIR)
  const pngFiles = allFiles.filter((filePath) => filePath.toLowerCase().endsWith('.png'))

  const results = []
  const variants = []
  for (const filePath of pngFiles) {
    const result = await compressImage(filePath)
    if (result) results.push(result)

    const variant = await createSilhouetteVariant(filePath)
    if (variant) variants.push(variant)
  }

  results.sort((a, b) => (b.before - b.after) - (a.before - a.after))

  const totalSaved = results.reduce((sum, item) => sum + (item.before - item.after), 0)
  console.log(`Compressed ${results.length} images. Saved ${formatKb(totalSaved)}.`)
  for (const item of results.slice(0, 25)) {
    console.log(
      `${item.relativePath} ${item.width}x${item.height} ${formatKb(item.before)} -> ${formatKb(item.after)}`
    )
  }

  if (variants.length > 0) {
    console.log(`Created ${variants.length} silhouette variants.`)
    for (const item of variants) {
      console.log(
        `${item.relativePath} from ${item.sourcePath} ${item.width}x${item.height} ${formatKb(item.before)} -> ${formatKb(item.after)}`
      )
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
