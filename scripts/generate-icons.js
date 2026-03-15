import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const svgPath = join(root, 'public', 'icons', 'logo.svg')
const outDir = join(root, 'public', 'img')

mkdirSync(outDir, { recursive: true })

const svg = readFileSync(svgPath)
const sizes = [16, 32, 48, 128]

await Promise.all(
  sizes.map(size =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(join(outDir, `logo-${size}.png`))
      .then(() => console.log(`✓ logo-${size}.png`))
  )
)

console.log('Done — icons written to public/img/')
