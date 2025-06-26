import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { PENSINE_DIRECTORY, SUPPORTED_EXTENSIONS } from '@/utils/constants'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dirPath = searchParams.get('dirPath')
  
  if (!dirPath) {
    return NextResponse.json({ error: 'Missing dirPath' }, { status: 400 })
  }
  
  try {
    const fullPath = path.join(process.cwd(), PENSINE_DIRECTORY, decodeURIComponent(dirPath))
    
    // Check if directory exists
    const stats = await fs.stat(fullPath)
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 })
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
          return SUPPORTED_EXTENSIONS.includes(ext as any)
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
    
    return NextResponse.json({ files: sortedResults })
  } catch (err) {
    console.error('Error reading directory:', err)
    return NextResponse.json({ error: 'Directory not found or error reading directory' }, { status: 500 })
  }
} 