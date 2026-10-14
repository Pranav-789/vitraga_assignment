import math
import uuid
import requests
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

COLLECTION_NAME = "locations"
VECTOR_DIM = 64

class DynamicLocationStore:
    def __init__(self):
        self.client = QdrantClient(":memory:")
        self._init_collection()

    def _generate_deterministic_vector(self, text: str) -> List[float]:
        """Generates a normalized deterministic vector representing semantic features."""
        vec = [0.0] * VECTOR_DIM
        for word in text.lower().split():
            h = abs(hash(word))
            idx = h % VECTOR_DIM
            vec[idx] += 1.0
        
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    def _init_collection(self):
        if self.client.collection_exists(collection_name=COLLECTION_NAME):
            self.client.delete_collection(collection_name=COLLECTION_NAME)
        self.client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )

    def _fetch_from_external_api(self, query: str, city: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetches live location data from Nominatim (OpenStreetMap) on cache miss."""
        clean_q = query
        for phrase in [
            "compact central walking attractions", "attractions in", 
            "attraction in", "places to visit in", "things to do in", "highlights in"
        ]:
            clean_q = clean_q.replace(phrase, "").strip()

        candidates = []
        if city and clean_q and clean_q.lower() != city.lower():
            candidates.append(f"{clean_q}, {city}")
        if clean_q:
            candidates.append(clean_q)
        if city and city not in candidates:
            candidates.append(city)
        if not candidates:
            candidates = [query]

        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "DynamicQdrantCachingApp/1.0"}

        results = []
        for cand in candidates:
            params = {
                "q": cand,
                "format": "json",
                "addressdetails": 1,
                "limit": 5
            }
            try:
                response = requests.get(url, params=params, headers=headers, timeout=5)
                response.raise_for_status()
                data = response.json()
                if data:
                    results = data
                    break
            except requests.RequestException as e:
                print(f"[API Error] Failed to fetch '{cand}': {e}")
                
        fetched_locations = []
        for res in results:
            addr = res.get("address", {})
            loc_name = res.get("name") or res.get("display_name", "").split(",")[0].strip() or query
            city_val = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or addr.get("hamlet") or addr.get("county") or city or "Unknown"
            fetched_locations.append({
                "location_id": str(uuid.uuid4()),
                "name": loc_name,
                "city": city_val,
                "country": addr.get("country", "Unknown"),
                "latitude": float(res.get("lat")),
                "longitude": float(res.get("lon")),
                "desc": res.get("display_name", ""),
                "description": res.get("display_name", ""),
                "category": res.get("type", res.get("class", "General"))
            })
        return fetched_locations

    def _embed_and_cache(self, locations: List[Dict[str, Any]]):
        """Generates vectors for new locations and upserts them into Qdrant."""
        if not locations:
            return
            
        points = []
        for loc in locations:
            # Create a rich text representation for the embedding
            text_repr = f"{loc['name']} {loc['city']} {loc['country']} {loc['description']} {loc['category']}"
            vector = self._generate_deterministic_vector(text_repr)
            
            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),  # Qdrant supports UUID strings natively
                    vector=vector,
                    payload=loc
                )
            )
            
        self.client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"[Cache] Upserted {len(points)} new locations into Qdrant VDB.")

    def search_locations(self, query: str, city: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        """Searches Qdrant first; falls back to API fetching and caching if missing."""
        query_text = f"{query} {city or ''}".strip()
        query_vec = self._generate_deterministic_vector(query_text)
        
        # 1. Attempt VDB Cache Retrieval
        query_response = self.client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vec,
            limit=limit * 2 # Over-fetch slightly to allow for post-filtering
        )
        
        matches = []
        for point in query_response.points:
            payload = point.payload or {}
            # Apply city filter if requested
            if city:
                city_low = city.lower()
                in_city = city_low in payload.get("city", "").lower()
                in_name = city_low in payload.get("name", "").lower()
                in_desc = city_low in payload.get("description", "").lower()
                in_country = city_low in payload.get("country", "").lower()
                if not (in_city or in_name or in_desc or in_country):
                    continue
            matches.append(payload)
            if len(matches) >= limit:
                break
                
        # 2. Handle Cache Miss
        if not matches:
            print(f"[Miss] '{query_text}' not found in VDB. Fetching dynamically...")
            new_locations = self._fetch_from_external_api(query, city)
            
            if new_locations:
                self._embed_and_cache(new_locations)
                matches = new_locations[:limit]
        else:
            print(f"[Hit] Retrieved '{query_text}' directly from VDB.")
            
        return matches

# Haversine and Transit Time Functions remain identical
def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat / 2) * math.sin(dLat / 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon / 2) * math.sin(dLon / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def estimate_transit_time_minutes(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Estimates realistic urban/inter-district transit time considering traffic/metro."""
    distance_km = haversine_distance_km(lat1, lon1, lat2, lon2)
    
    # In-city average speed ~ 25 km/h + 10 mins buffer for boarding/walking
    if distance_km < 1.0:
        return 10 # 10 min walk
    elif distance_km <= 15.0:
        transit_time = int((distance_km / 25.0) * 60) + 12
        return transit_time
    elif distance_km <= 50.0:
        transit_time = int((distance_km / 45.0) * 60) + 20
        return transit_time
    else:
        # High speed train or intercity
        transit_time = int((distance_km / 80.0) * 60) + 40
        return transit_time

# Backward compatibility alias
QdrantLocationStore = DynamicLocationStore

# Global instance
location_store = DynamicLocationStore()
