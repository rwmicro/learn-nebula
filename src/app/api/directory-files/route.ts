import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { PENSINE_DIRECTORY, SUPPORTED_EXTENSIONS } from '@/utils/constants'
import { validatePath, checkRateLimit, extractClientIp, sanitizeForLog } from '@/lib/security'
import { logger } from '@/lib/logger'
import { jsonResponse, errorResponse } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const requestOrigin = request.headers.get('origin')

  // Rate limiting with proper IP extraction
  const clientIp = extractClientIp(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip')
  )
  if (!checkRateLimit(clientIp, 100, 60000)) {
    logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: '/api/directory-files' })
    return errorResponse('Too many requests', 429, requestOrigin)
  }

  const { searchParams } = new URL(request.url)
  const dirPath = searchParams.get('dirPath')

  if (!dirPath) {
    logger.warn('Missing dirPath parameter', { ip: clientIp })
    return errorResponse('Missing dirPath', 400, requestOrigin)
  }

  // Validate path length
  if (dirPath.length > 500) {
    logger.warn('DirPath too long', { ip: clientIp, length: dirPath.length })
    return errorResponse('Invalid dirPath', 400, requestOrigin)
  }

  try {
    const baseDir = path.join(process.cwd(), PENSINE_DIRECTORY)
    const fullPath = validatePath(dirPath, baseDir)

    if (!fullPath) {
      logger.warn('Invalid path attempted', { ip: clientIp, dirPath: sanitizeForLog(dirPath) })
      return errorResponse('Invalid directory path', 403, requestOrigin)
    }

    // Check if directory exists
    const stats = await fs.stat(fullPath)
    if (!stats.isDirectory()) {
      logger.warn('Attempted to read non-directory', { ip: clientIp, dirPath: sanitizeForLog(dirPath) })
      return errorResponse('Path is not a directory', 400, requestOrigin)
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true })

    const files = entries
      .filter(entry => {
        if (entry.isFile()) {
          // Exclude hidden files (starting with .)
          if (entry.name.startsWith('.')) {
            return false
          }
          const ext = path.extname(entry.name).toLowerCase().slice(1)
          return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])
        }
        return false
      })
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name).replace(/\\/g, '/'),
        type: path.extname(entry.name).toLowerCase().slice(1),
        isDirectory: false
      }))

    const directories = entries
      .filter(entry => {
        // Exclude hidden directories (starting with .)
        if (entry.isDirectory() && entry.name.startsWith('.')) {
          return false
        }
        return entry.isDirectory()
      })
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name).replace(/\\/g, '/'),
        type: 'directory',
        isDirectory: true
      }))

    // Sort: directories first, then files alphabetically
    const sortedResults = [
      ...directories.sort((a, b) => a.name.localeCompare(b.name)),
      ...files.sort((a, b) => a.name.localeCompare(b.name))
    ]

    return jsonResponse({ files: sortedResults }, 200, 300, requestOrigin) // Cache for 5 minutes
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('Directory not found', { dirPath: sanitizeForLog(dirPath) })
      return errorResponse('Directory not found', 404, requestOrigin)
    }

    // Log detailed error server-side only
    logger.error('Error reading directory', {
      error: err instanceof Error ? err.message : String(err),
      dirPath: sanitizeForLog(dirPath)
    })
    // Return generic error to client
    return errorResponse('Error reading directory', 500, requestOrigin)
  }
}
