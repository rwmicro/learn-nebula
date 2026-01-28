import { NextResponse } from 'next/server'

// Allowed origins for CORS - only allow specific origins, never wildcard in production
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  'https://pensine.nebula.li',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[]

/**
 * Validates if an origin is allowed for CORS
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.some(allowed => origin === allowed || origin.startsWith(allowed))
}

/**
 * Gets the CORS origin header value
 * Returns the origin if allowed, otherwise returns the primary site URL
 */
function getCorsOrigin(requestOrigin: string | null): string {
  if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    return requestOrigin
  }
  // Default to primary site URL, never wildcard
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://pensine.nebula.li'
}

/**
 * Creates response headers with CORS and caching configuration
 * @param cacheMaxAge - Cache max age in seconds (default: 300 = 5 minutes)
 * @param requestOrigin - The origin header from the request
 * @returns Headers object with CORS and cache settings
 */
export function createResponseHeaders(cacheMaxAge: number = 300, requestOrigin?: string | null): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge * 2}`,
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin ?? null),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  })
  return headers
}

/**
 * Creates a JSON response with proper headers
 * @param data - The data to return
 * @param status - HTTP status code (default: 200)
 * @param cacheMaxAge - Cache max age in seconds (default: 300)
 * @param requestOrigin - The origin header from the request
 * @returns NextResponse with proper headers
 */
export function jsonResponse<T>(
  data: T,
  status: number = 200,
  cacheMaxAge: number = 300,
  requestOrigin?: string | null
): NextResponse {
  const headers = createResponseHeaders(cacheMaxAge, requestOrigin)
  return NextResponse.json(data, { status, headers })
}

/**
 * Creates an error response with proper headers (no caching)
 * Returns generic error messages to clients - detailed errors should only be logged server-side
 * @param error - Error message (should be generic, not exposing internals)
 * @param status - HTTP status code
 * @param requestOrigin - The origin header from the request
 * @returns NextResponse with error
 */
export function errorResponse(error: string, status: number, requestOrigin?: string | null): NextResponse {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin ?? null),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  })
  return NextResponse.json({ error }, { status, headers })
}
