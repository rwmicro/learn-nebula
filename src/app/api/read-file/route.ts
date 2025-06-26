// pages/api/read-file.ts
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('filePath')
  
  if (!filePath) {
    return NextResponse.json({ error: 'Missing filePath' }, { status: 400 })
  }
  
  try {
    const fullPath = path.join(process.cwd(), 'public', 'articles', 'pensine', decodeURIComponent(filePath))
    const content = await fs.readFile(fullPath, 'utf-8')
    return NextResponse.json({ content })
  } catch (err) {
    console.error('Error reading file:', err)
    return NextResponse.json({ error: 'File not found or error reading file' }, { status: 500 })
  }
}