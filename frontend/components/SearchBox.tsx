import { useState } from 'react'

interface SearchBoxProps {
  onSearch: (query: string) => void
  loading?: boolean
}

export default function SearchBox({ onSearch, loading = false }: SearchBoxProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., best lunch near Stureplan for business meeting under 200 SEK"
          disabled={loading}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Try natural language! E.g., "quiet coffee place with wifi", "family-friendly lunch spot with outdoor seating"
      </p>
    </form>
  )
}
