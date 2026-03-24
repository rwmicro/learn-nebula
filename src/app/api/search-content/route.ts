import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { checkRateLimit, extractClientIp } from '@/lib/security'
import { jsonResponse, errorResponse } from '@/lib/api-utils'
import { logger } from '@/lib/logger'

const SEARCHABLE_EXTENSIONS = ['.md', '.mdx']
const MAX_RESULTS = 15
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

const searchCache = new Map<string, { results: SearchResult[]; expiresAt: number }>()

interface SearchResult {
  path: string
  title: string
  snippet: string
  matchCount: number
}

function extractTitle(content: string, filename: string): string {
  const frontmatterTitle = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterTitle) return frontmatterTitle[1]
  const heading = content.match(/^#\s+(.+)$/m)
  if (heading) return heading[1]
  return filename.replace(/\.[^/.]+$/, '')
}

function stripFrontmatter(content: string): string {
  return content.startsWith('---') ? content.replace(/^---[\s\S]*?\n---\n?/, '') : content
}

async function searchFiles(dir: string, query: string, baseDir: string, results: SearchResult[]): Promise<void> {
  if (results.length >= MAX_RESULTS) return
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch { return }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await searchFiles(fullPath, query, baseDir, results)
    } else if (SEARCHABLE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      try {
        const raw = await fs.readFile(fullPath, 'utf-8')
        const body = stripFrontmatter(raw)
        const lowerBody = body.toLowerCase()
        const lowerQuery = query.toLowerCase()
        const idx = lowerBody.indexOf(lowerQuery)
        if (idx === -1) continue

        const start = Math.max(0, idx - 70)
        const end = Math.min(body.length, idx + query.length + 70)
        const snippet =
          (start > 0 ? '…' : '') +
          body.slice(start, end).replace(/\n+/g, ' ').trim() +
          (end < body.length ? '…' : '')

        let matchCount = 0
        let pos = 0
        while ((pos = lowerBody.indexOf(lowerQuery, pos)) !== -1) { matchCount++; pos += lowerQuery.length }

        results.push({
          path: '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/'),
          title: extractTitle(raw, entry.name),
          snippet,
          matchCount,
        })
      } catch { /* skip unreadable files */ }
    }
  }
}

export async function GET(request: NextRequest) {
  const requestOrigin = request.headers.get('origin')
  const clientIp = extractClientIp(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip'))
  if (!checkRateLimit(clientIp, 20, 60000)) return errorResponse('Too many requests', 429, requestOrigin)

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) return errorResponse('Query too short', 400, requestOrigin)
  if (query.length > 100) return errorResponse('Query too long', 400, requestOrigin)

  try {
    const cacheKey = query.toLowerCase()
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return jsonResponse({ results: cached.results }, 200, 0, requestOrigin)
    }

    const baseDir = path.join(process.cwd(), 'public', 'articles', 'pensine')
    const results: SearchResult[] = []
    await searchFiles(baseDir, query, baseDir, results)
    results.sort((a, b) => b.matchCount - a.matchCount)
    searchCache.set(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS })
    return jsonResponse({ results }, 200, 0, requestOrigin)
  } catch (err) {
    logger.error('Search content error', { error: err instanceof Error ? err.message : String(err) })
    return errorResponse('Search failed', 500, requestOrigin)
  }
}
