export interface Venue {
  id: number
  name: string
  address: string
  lat: number
  lng: number
  is_terrace: boolean
  is_restaurant: boolean
  cuisine_tags?: string[]
  price_range?: number
  google_rating?: number
  review_count?: number
  phone?: string
  website?: string
  outdoor_seating?: boolean
  indoor_seating?: boolean
  outdoor_seats?: number
  orientation?: string
  kid_friendly?: boolean
  wheelchair_accessible?: boolean
  wifi?: boolean
  neighbourhood?: string
  google_place_id?: string
  description?: string
  explanation?: string
  sunshine_status?: {
    shadowed: boolean
    score: number
  }
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
