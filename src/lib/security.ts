import path from 'path'
import fs from 'fs'

// Maximum entries in rate limit store to prevent memory exhaustion
const MAX_RATE_LIMIT_ENTRIES = 10000

// Dangerous patterns that should never appear in paths
const DANGEROUS_PATTERNS = [
  '\0',           // Null byte
  '%00',          // URL encoded null byte
  '..',           // Parent directory traversal
  '//',           // Double slash
  '\\\\',         // Double backslash
  '..%2f',        // URL encoded traversal
  '..%5c',        // URL encoded backslash traversal
  '%2e%2e',       // Double URL encoded dots
]

/**
 * Validates and sanitizes a file path to prevent directory traversal attacks
 * @param inputPath - The user-provided path to validate
 * @param baseDir - The base directory that the path should be within
 * @returns The sanitized absolute path if valid, null if invalid
 */
export function validatePath(inputPath: string, baseDir: string): string | null {
  try {
    // Check for null bytes and dangerous patterns BEFORE decoding
    const lowerInput = inputPath.toLowerCase()
    for (const pattern of DANGEROUS_PATTERNS) {
      if (lowerInput.includes(pattern.toLowerCase())) {
        return null
      }
    }

    // Decode the path
    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(inputPath)
    } catch {
      // Invalid URL encoding
      return null
    }

    // Check decoded path for dangerous patterns again
    const lowerDecoded = decodedPath.toLowerCase()
    for (const pattern of DANGEROUS_PATTERNS) {
      if (lowerDecoded.includes(pattern.toLowerCase())) {
        return null
      }
    }

    // Allow safe characters: alphanumeric, dash, underscore, dot, forward slash, space
    // Also allow Unicode letters (for international file names like Japanese, Chinese, etc.)
    // The \p{L} matches any Unicode letter
    if (!/^[\p{L}\p{N}\-_./\s]+$/u.test(decodedPath)) {
      return null
    }

    // Strip leading slashes so path.resolve treats it as relative to baseDir
    const relativized = decodedPath.replace(/^\/+/, '')

    // Resolve both paths to absolute
    const normalizedBasePath = path.resolve(baseDir)
    const fullPath = path.resolve(normalizedBasePath, relativized)

    // Use path.relative to check if fullPath is within baseDir
    const relativePath = path.relative(normalizedBasePath, fullPath)

    // If relative path starts with '..' or is absolute, it's outside the base
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null
    }

    // Additional check: resolve symlinks and verify again
    try {
      const realBasePath = fs.realpathSync(normalizedBasePath)
      // Only check realpath if the file exists
      if (fs.existsSync(fullPath)) {
        const realFullPath = fs.realpathSync(fullPath)
        if (!realFullPath.startsWith(realBasePath + path.sep) && realFullPath !== realBasePath) {
          return null
        }
      }
    } catch {
      // If realpath fails on base, that's a configuration error
      // If it fails on fullPath, the file might not exist yet (which is ok for some operations)
    }

    return fullPath
  } catch {
    return null
  }
}

/**
 * Rate limiting store using in-memory map with size limits
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Extracts the real client IP from headers
 * Handles x-forwarded-for which can contain multiple IPs
 * @param forwardedFor - The x-forwarded-for header value
 * @param realIp - The x-real-ip header value
 * @returns The extracted client IP
 */
export function extractClientIp(forwardedFor: string | null, realIp: string | null): string {
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
    // The first one is the original client
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp && isValidIp(firstIp)) {
      return firstIp
    }
  }

  if (realIp && isValidIp(realIp)) {
    return realIp
  }

  return 'unknown'
}

/**
 * Basic IP validation (IPv4 and IPv6)
 */
function isValidIp(ip: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/

  if (ipv4Pattern.test(ip)) {
    const parts = ip.split('.').map(Number)
    return parts.every(part => part >= 0 && part <= 255)
  }

  return ipv6Pattern.test(ip)
}

/**
 * Simple rate limiter with memory protection
 * @param identifier - Unique identifier (e.g., IP address)
 * @param limit - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60000 // 1 minute
): boolean {
  const now = Date.now()

  // Prevent memory exhaustion: if store is too large, clean it first
  if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
    cleanupRateLimitStore()

    // If still too large after cleanup, reject new entries (but allow existing)
    if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES && !rateLimitStore.has(identifier)) {
      return false
    }
  }

  const record = rateLimitStore.get(identifier)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  record.count++
  return true
}

/**
 * Clean up old rate limit entries
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

// Clean up every 2 minutes (more frequent to prevent buildup)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitStore, 120000)
}

/**
 * Sanitize a string for safe logging (remove potential injection)
 */
export function sanitizeForLog(input: string, maxLength: number = 200): string {
  return input
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[<>'"&]/g, '') // Remove potential HTML/injection chars
}
