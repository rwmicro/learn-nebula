import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
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
    logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: '/api/read-file' })
    return errorResponse('Too many requests', 429, requestOrigin)
  }

  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('filePath')

  if (!filePath) {
    logger.warn('Missing filePath parameter', { ip: clientIp })
    return errorResponse('Missing filePath', 400, requestOrigin)
  }

  // Validate path length
  if (filePath.length > 500) {
    logger.warn('FilePath too long', { ip: clientIp, length: filePath.length })
    return errorResponse('Invalid filePath', 400, requestOrigin)
  }

  try {
    const baseDir = path.join(process.cwd(), 'public', 'articles', 'pensine')
    const fullPath = validatePath(filePath, baseDir)

    if (!fullPath) {
      logger.warn('Invalid path attempted', { ip: clientIp, filePath: sanitizeForLog(filePath) })
      return errorResponse('Invalid file path', 403, requestOrigin)
    }

    // Check if file exists and is a file (not a directory)
    const stats = await fs.stat(fullPath)
    if (!stats.isFile()) {
      logger.warn('Attempted to read non-file', { ip: clientIp, filePath: sanitizeForLog(filePath) })
      return errorResponse('Not a file', 400, requestOrigin)
    }

    const content = await fs.readFile(fullPath, 'utf-8')
    return jsonResponse({ content }, 200, 300, requestOrigin) // Cache for 5 minutes
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('File not found', { filePath: sanitizeForLog(filePath) })
      return errorResponse('File not found', 404, requestOrigin)
    }

    // Log detailed error server-side only
    logger.error('Error reading file', {
      error: err instanceof Error ? err.message : String(err),
      filePath: sanitizeForLog(filePath)
    })
    // Return generic error to client
    return errorResponse('Error reading file', 500, requestOrigin)
  }
}
