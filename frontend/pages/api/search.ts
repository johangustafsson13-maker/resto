import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query } = req.body

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query parameter is required' })
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const response = await fetch(`${apiUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Backend API responded with ${response.status}`)
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    console.error('Search API error:', error)
    return res.status(500).json({
      error: 'Search failed',
      results: []
    })
  }
}
