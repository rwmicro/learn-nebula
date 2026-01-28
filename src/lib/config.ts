/**
 * Application configuration
 * Centralized configuration values that can be overridden by environment variables
 */

export const config = {
  site: {
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://pensine.nebula.li',
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'Pensine',
    description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || 'Garden of Knowledge',
  },
  search: {
    maxResults: 8,
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
  },
} as const
