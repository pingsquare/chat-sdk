import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const limit = 50 * 1024
const size = gzipSync(readFileSync('dist/embed.js')).length

console.log(`dist/embed.js: ${(size / 1024).toFixed(1)} KB gzipped (limit ${limit / 1024} KB)`)
if (size > limit) process.exit(1)
