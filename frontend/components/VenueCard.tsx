import type { Venue } from '../types'

interface VenueCardProps {
  venue: Venue
  selected?: boolean
  onClick?: () => void
}

export default function VenueCard({ venue, selected = false, onClick }: VenueCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 border rounded-lg cursor-pointer transition-all ${
        selected
          ? 'border-orange-500 bg-orange-50 shadow-lg'
          : 'border-gray-300 bg-white hover:border-orange-400 hover:shadow-md'
      }`}
    >
      <h3 className="text-lg font-semibold text-gray-900">{venue.name}</h3>
      <p className="text-sm text-gray-600 mt-1">{venue.address}</p>

      {/* Rating and Price */}
      <div className="flex items-center gap-3 mt-3">
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">★</span>
          <span className="text-sm font-medium text-gray-900">{venue.google_rating}/5</span>
        </div>
        <div className="text-sm text-gray-600">
          {venue.price_range && '●'.repeat(venue.price_range)}
        </div>
      </div>

      {/* Cuisines */}
      {venue.cuisine_tags && venue.cuisine_tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {venue.cuisine_tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-1 bg-gray-200 text-gray-800 rounded-full"
            >
              {tag}
            </span>
          ))}
          {venue.cuisine_tags.length > 2 && (
            <span className="text-xs px-2 py-1 bg-gray-200 text-gray-800 rounded-full">
              +{venue.cuisine_tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Explanation */}
      {venue.explanation && (
        <p className="text-sm text-gray-700 mt-3 italic border-t border-gray-200 pt-2">
          "{venue.explanation}"
        </p>
      )}

      {/* Contact */}
      <div className="flex items-center gap-2 mt-3 text-xs text-gray-600">
        {venue.phone && <span>{venue.phone}</span>}
        {venue.website && (
          <a href={venue.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Website
          </a>
        )}
      </div>
    </div>
  )
}
