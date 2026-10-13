import math
import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# Pre-populated ground-truth location dataset with real-world latitude/longitude
SEED_LOCATIONS = [
    # Tokyo, Japan
    {"name": "Senso-ji Temple", "city": "Tokyo", "country": "Japan", "lat": 35.7148, "lng": 139.7967, "desc": "Ancient Buddhist temple in Asakusa", "category": "Culture"},
    {"name": "Tokyo Skytree", "city": "Tokyo", "country": "Japan", "lat": 35.7100, "lng": 139.8107, "desc": "Broadcasting and observation tower with panoramic city views", "category": "Landmark"},
    {"name": "Ueno Park & Museums", "city": "Tokyo", "country": "Japan", "lat": 35.7140, "lng": 139.7741, "desc": "Spacious public park with Tokyo National Museum", "category": "Nature & Art"},
    {"name": "Meiji Jingu Shrine", "city": "Tokyo", "country": "Japan", "lat": 35.6764, "lng": 139.6993, "desc": "Forested Shinto shrine dedicated to Emperor Meiji", "category": "Culture"},
    {"name": "Shibuya Crossing & Hachiko", "city": "Tokyo", "country": "Japan", "lat": 35.6595, "lng": 139.7005, "desc": "World's busiest pedestrian crossing and neon entertainment hub", "category": "Sightseeing"},
    {"name": "Shinjuku Gyoen National Garden", "city": "Tokyo", "country": "Japan", "lat": 35.6852, "lng": 139.7101, "desc": "Serene park blending traditional Japanese, English and French gardens", "category": "Nature"},
    {"name": "Akihabara Electric Town", "city": "Tokyo", "country": "Japan", "lat": 35.6983, "lng": 139.7731, "desc": "Center of gaming, electronics and otaku culture", "category": "Shopping"},
    {"name": "Tsukiji Outer Market", "city": "Tokyo", "country": "Japan", "lat": 35.6655, "lng": 139.7707, "desc": "Vibrant market famous for fresh sushi, street food, and culinary knives", "category": "Food"},
    {"name": "Roppongi Hills & Mori Art Museum", "city": "Tokyo", "country": "Japan", "lat": 35.6605, "lng": 139.7292, "desc": "Contemporary art museum and city observatory", "category": "Art"},
    {"name": "Ginza Shopping District", "city": "Tokyo", "country": "Japan", "lat": 35.6719, "lng": 139.7650, "desc": "Upscale shopping, dining, and luxury boutique street", "category": "Shopping"},

    # Kyoto, Japan
    {"name": "Fushimi Inari Taisha", "city": "Kyoto", "country": "Japan", "lat": 34.9671, "lng": 135.7727, "desc": "Iconic shrine known for thousands of vermilion torii gates", "category": "Culture"},
    {"name": "Kinkaku-ji (Golden Pavilion)", "city": "Kyoto", "country": "Japan", "lat": 35.0394, "lng": 135.7292, "desc": "Zen Buddhist temple covered in shimmering gold leaf", "category": "Landmark"},
    {"name": "Arashiyama Bamboo Grove", "city": "Kyoto", "country": "Japan", "lat": 35.0169, "lng": 135.6713, "desc": "Enchanting path flanked by towering green bamboo stalks", "category": "Nature"},
    {"name": "Kiyomizu-dera Temple", "city": "Kyoto", "country": "Japan", "lat": 34.9949, "lng": 135.7850, "desc": "Historic hillside temple offering scenic veranda vistas", "category": "Culture"},
    {"name": "Gion Historic Geisha District", "city": "Kyoto", "country": "Japan", "lat": 35.0037, "lng": 135.7772, "desc": "Traditional wooden machiya houses and tea houses", "category": "Heritage"},

    # Paris, France
    {"name": "Eiffel Tower", "city": "Paris", "country": "France", "lat": 48.8584, "lng": 2.2945, "desc": "World famous iron lattice tower on the Champ de Mars", "category": "Landmark"},
    {"name": "Louvre Museum", "city": "Paris", "country": "France", "lat": 48.8606, "lng": 2.3376, "desc": "Historic monument and world's most visited art museum", "category": "Art & History"},
    {"name": "Musee d'Orsay", "city": "Paris", "country": "France", "lat": 48.8599, "lng": 2.3265, "desc": "Impressionist masterworks housed in a beaux-arts railway station", "category": "Art"},
    {"name": "Montmartre & Sacre-Coeur", "city": "Paris", "country": "France", "lat": 48.8867, "lng": 2.3431, "desc": "Bohemian hilltop district crowned by a white domed basilica", "category": "Sightseeing"},
    {"name": "Notre-Dame Cathedral & Seine Cruise", "city": "Paris", "country": "France", "lat": 48.8530, "lng": 2.3499, "desc": "Medieval Catholic cathedral on the Ile de la Cite", "category": "Culture"},

    # Rome, Italy
    {"name": "Colosseum & Roman Forum", "city": "Rome", "country": "Italy", "lat": 41.8902, "lng": 12.4922, "desc": "Monumental ancient gladiatorial amphitheatre and imperial ruins", "category": "History"},
    {"name": "Vatican Museums & St. Peter's", "city": "Rome", "country": "Italy", "lat": 41.9029, "lng": 12.4534, "desc": "Sistine Chapel and the epicenter of Renaissance religious art", "category": "Art"},
    {"name": "Pantheon & Piazza Navona", "city": "Rome", "country": "Italy", "lat": 41.8986, "lng": 12.4769, "desc": "Impeccably preserved Roman temple with open oculus dome", "category": "Landmark"},
    {"name": "Trevi Fountain & Spanish Steps", "city": "Rome", "country": "Italy", "lat": 41.9009, "lng": 12.4833, "desc": "Iconic Baroque fountain and grand 18th-century staircase", "category": "Sightseeing"},

    # Bali, Indonesia
    {"name": "Ubud Monkey Forest & Rice Terraces", "city": "Bali", "country": "Indonesia", "lat": -8.5192, "lng": 115.2630, "desc": "Lush sanctuary with playful macaques and emerald terraces", "category": "Nature"},
    {"name": "Tanah Lot Sea Temple", "city": "Bali", "country": "Indonesia", "lat": -8.6212, "lng": 115.0868, "desc": "Ancient offshore temple perched atop an ocean rock formation", "category": "Culture"},
    {"name": "Uluwatu Cliff Temple & Sunset Kecak", "city": "Bali", "country": "Indonesia", "lat": -8.8291, "lng": 115.0849, "desc": "Spectacular cliffside temple with sunset traditional fire dance", "category": "Culture & Sunset"},
    {"name": "Seminyak Beach & Beach Clubs", "city": "Bali", "country": "Indonesia", "lat": -8.6913, "lng": 115.1557, "desc": "Vibrant beachside strip with dining and sunset lounges", "category": "Relaxation"},

    # Shimla, India
    {"name": "The Ridge & Mall Road", "city": "Shimla", "country": "India", "lat": 31.1048, "lng": 77.1734, "desc": "Heart of Shimla with colonial charm, scenic valley views and pedestrian promenade", "category": "Sightseeing"},
    {"name": "Jakhoo Temple & Ropeway", "city": "Shimla", "country": "India", "lat": 31.1009, "lng": 77.1852, "desc": "Ancient shrine on Shimla's highest peak with giant Lord Hanuman statue and panoramic viewpoints", "category": "Culture & Nature"},
    {"name": "Christ Church Shimla", "city": "Shimla", "country": "India", "lat": 31.1044, "lng": 77.1749, "desc": "Second oldest church in Northern India with neo-Gothic stained glass architecture", "category": "Heritage"},
    {"name": "Viceregal Lodge (Rashtrapati Niwas)", "city": "Shimla", "country": "India", "lat": 31.1030, "lng": 77.1425, "desc": "Iconic British Raj summer residence with manicured botanical lawns", "category": "History"},
    {"name": "Kufri Adventure Peak & Himalayan Park", "city": "Shimla", "country": "India", "lat": 31.0979, "lng": 77.2678, "desc": "High altitude scenic ridge with snow sports, nature park and valley panoramas", "category": "Adventure & Nature"},
    {"name": "Tara Devi Temple", "city": "Shimla", "country": "India", "lat": 31.0728, "lng": 77.1420, "desc": "Peaceful hilltop sacred temple with 360-degree Himalayan views", "category": "Spiritual"},
    {"name": "Chadwick Falls & Glen Forest", "city": "Shimla", "country": "India", "lat": 31.1189, "lng": 77.1444, "desc": "Picturesque waterfall surrounded by lush pine and deodar forests", "category": "Nature"},
    {"name": "Annandale Army Heritage Museum", "city": "Shimla", "country": "India", "lat": 31.1105, "lng": 77.1558, "desc": "Historic British recreational plateau with military museum and golf grounds", "category": "Heritage"},
    {"name": "Lakkar Bazaar", "city": "Shimla", "country": "India", "lat": 31.1070, "lng": 77.1760, "desc": "Famous market for wooden crafts, local woolens and Himachali delicacies", "category": "Shopping"}
]

COLLECTION_NAME = "locations"
VECTOR_DIM = 64  # Compact embedding space for fast in-memory semantic grounding

class QdrantLocationStore:
    def __init__(self):
        # In-memory Qdrant client ensures 100% reliability, speed, and zero external infra requirement
        self.client = QdrantClient(":memory:")
        self._init_collection()
        self._seed_data()

    def _generate_deterministic_vector(self, text: str) -> List[float]:
        """Generates a normalized deterministic vector representing semantic features."""
        vec = [0.0] * VECTOR_DIM
        for word in text.lower().split():
            h = abs(hash(word))
            idx = h % VECTOR_DIM
            vec[idx] += 1.0
        
        # Normalize
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    def _init_collection(self):
        if self.client.collection_exists(collection_name=COLLECTION_NAME):
            self.client.delete_collection(collection_name=COLLECTION_NAME)
        self.client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )

    def _seed_data(self):
        points = []
        for i, loc in enumerate(SEED_LOCATIONS):
            text = f"{loc['name']} {loc['city']} {loc['country']} {loc['desc']} {loc['category']}"
            vector = self._generate_deterministic_vector(text)
            location_id = f"loc_{loc['city'].lower()}_{i+1}"
            
            points.append(
                PointStruct(
                    id=i + 1,
                    vector=vector,
                    payload={
                        "location_id": location_id,
                        "name": loc["name"],
                        "city": loc["city"],
                        "country": loc["country"],
                        "latitude": loc["lat"],
                        "longitude": loc["lng"],
                        "description": loc["desc"],
                        "category": loc["category"]
                    }
                )
            )
        self.client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"[Qdrant] Grounded database seeded with {len(points)} verified locations.")

    def search_locations(self, query: str, city: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        """Performs vector search in Qdrant for fact-grounded locations."""
        query_text = f"{query} {city or ''}"
        query_vec = self._generate_deterministic_vector(query_text)
        
        query_response = self.client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vec,
            limit=limit * 2
        )
        
        matches = []
        for point in query_response.points:
            payload = point.payload or {}
            if city and city.lower() not in payload.get("city", "").lower() and city.lower() not in payload.get("country", "").lower():
                continue
            matches.append(payload)
            if len(matches) >= limit:
                break
                
        # If city filter resulted in empty, fallback to city matches directly
        if not matches and city:
            for loc in SEED_LOCATIONS:
                if city.lower() in loc["city"].lower() or city.lower() in loc["country"].lower():
                    matches.append({
                        "location_id": f"loc_{loc['city'].lower()}",
                        "name": loc["name"],
                        "city": loc["city"],
                        "country": loc["country"],
                        "latitude": loc["lat"],
                        "longitude": loc["lng"],
                        "description": loc["desc"],
                        "category": loc["category"]
                    })
                    if len(matches) >= limit:
                        break

        # Fallback default if still empty
        if not matches:
            matches = [p.payload for p in query_response.points[:limit]]

        return matches

# Haversine distance calculator for real physical travel time validation
def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0 # Earth radius in kilometers
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

# Global instance
location_store = QdrantLocationStore()
