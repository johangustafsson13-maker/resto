export interface Venue {
  id: number
  name: string
  address: string
  lat: number
  lng: number
  cuisine_tags?: string[]
  price_range?: number
  google_rating?: number
  review_count?: number
  phone?: string
  website?: string
  outdoor_seating?: boolean
  kid_friendly?: boolean
  wheelchair_accessible?: boolean
  explanation?: string
}

export interface Intent {
  location?: string
  time?: string
  ambiance?: string
  budget?: number
  party_size?: number
  dietary_restrictions?: string[]
  outdoor?: boolean
  must_have_features?: string[]
}

export interface SearchResult {
  venues: Venue[]
  intent?: Intent
}
