# Resto API Documentation

## Base URL
```
http://localhost:3001/api
```

## Health Check

### GET `/health`
Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-05-20T10:30:00.000Z"
}
```

---

## Search Endpoints

### POST `/search`
Search for restaurants by natural language query.

**Request:**
```json
{
  "query": "best lunch spot near Stureplan for business meeting under 200 SEK",
  "userId": "user123",
  "limit": 5
}
```

**Response:**
```json
{
  "query": "best lunch spot near Stureplan for business meeting under 200 SEK",
  "venues": [
    {
      "id": 1,
      "name": "Restaurant Name",
      "address": "Street 123, Stureplan",
      "lat": 59.3328,
      "lng": 18.0753,
      "cuisine_tags": ["Swedish", "Modern"],
      "price_range": 3,
      "google_rating": 4.5,
      "review_count": 150,
      "phone": "+46 8 123 4567",
      "website": "https://restaurant.com",
      "outdoor_seating": true,
      "kid_friendly": false,
      "wheelchair_accessible": true,
      "explanation": "Perfect match: business-friendly ambiance, excellent for lunch, great reviews for quality food within your budget."
    }
  ]
}
```

**Status Codes:**
- 200: Success
- 400: Bad request (missing query)
- 500: Server error

---

### POST `/parse-intent`
Parse a natural language query into structured intent.

**Request:**
```json
{
  "query": "cozy coffee place with wifi in Södermalm, vegetarian options"
}
```

**Response:**
```json
{
  "query": "cozy coffee place with wifi in Södermalm, vegetarian options",
  "intent": {
    "location": "Södermalm",
    "time": "coffee",
    "ambiance": ["cozy"],
    "budget": null,
    "party_size": null,
    "dietary_restrictions": ["vegetarian"],
    "outdoor": false,
    "must_have_features": ["wifi"],
    "special_occasions": null
  },
  "parsed": true
}
```

**Intent Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `location` | string \| null | Stockholm neighborhood (e.g., "Södermalm", "Norrmalm") |
| `time` | string \| null | Time of day: 'breakfast', 'lunch', 'dinner', 'coffee', 'late_night' |
| `ambiance` | string[] | Atmosphere: 'casual', 'romantic', 'business', 'quiet', 'lively', 'trendy', 'cozy' |
| `budget` | number \| null | Maximum SEK |
| `party_size` | number \| null | Number of people |
| `dietary_restrictions` | string[] | 'vegetarian', 'vegan', 'gluten_free', etc. |
| `outdoor` | boolean | Outdoor seating required |
| `must_have_features` | string[] | 'wifi', 'quiet', 'music', 'dog_friendly', etc. |
| `special_occasions` | string \| null | 'date_night', 'business_meeting', 'family_gathering' |

---

### POST `/rank`
Rank venues by relevance to user intent.

**Request:**
```json
{
  "venues": [
    {
      "id": 1,
      "name": "Restaurant A",
      "address": "Street 1",
      "cuisine_tags": ["Swedish"],
      "price_range": 3,
      "google_rating": 4.5,
      "open_hours": { "Mon": "11-22", "Tue": "11-22" }
    }
  ],
  "intent": {
    "location": "Stureplan",
    "time": "lunch",
    "ambiance": ["business"],
    "budget": 200,
    "party_size": 2
  }
}
```

**Response:**
```json
{
  "intent": { ... },
  "ranking": {
    "ranked": [
      {
        "venue_id": 1,
        "score": 0.95,
        "explanation": "Perfect match: business-friendly ambiance, conveniently located near Stureplan, average price well under your 200 SEK budget."
      },
      {
        "venue_id": 2,
        "score": 0.72,
        "explanation": "Good option: Swedish cuisine, reasonable prices, but slightly further from Stureplan and less formal atmosphere."
      }
    ]
  },
  "count": 2
}
```

**Score Interpretation:**
- 0.9-1.0: Excellent match
- 0.7-0.89: Good match
- 0.5-0.69: Decent option
- Below 0.5: Not ideal but available

---

## Authentication Endpoints

### POST `/auth/signup`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "subscription_status": "free"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### POST `/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "subscription_status": "free",
    "searches_remaining": 3
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Error Handling

All errors return JSON with an error message:

```json
{
  "error": "Query is required"
}
```

### Common Error Codes
| Status | Error | Cause |
|--------|-------|-------|
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Invalid credentials |
| 409 | Conflict | Email already registered |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## Rate Limiting

Default rate limit: **5 requests per 60 seconds** per IP.

When limit is exceeded:
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

---

## Examples

### Example 1: Search for Business Lunch

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quiet business lunch near Stureplan, under 250 SEK"
  }'
```

### Example 2: Parse Intent

```bash
curl -X POST http://localhost:3001/api/parse-intent \
  -H "Content-Type: application/json" \
  -d '{
    "query": "family-friendly dinner with kids in Södermalm"
  }'
```

### Example 3: Sign Up

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "johan@example.com",
    "password": "mypassword"
  }'
```
