from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class Coordinate(BaseModel):
    latitude: float
    longitude: float

class TimeSlot(BaseModel):
    slot_id: str
    slot_type: str = Field(description="'morning', 'afternoon', or 'evening'")
    start_time: str = ""
    location_id: Optional[str] = None
    location_name: str
    coordinates: Optional[Coordinate] = None
    activity_description: str
    travel_time_from_prev_mins: Optional[int] = 0
    validation_status: str = "valid"

class DailyItinerary(BaseModel):
    day_number: int
    title: str = ""
    validation_status: str = "valid"  # 'valid', 'failed', 'regenerated'
    morning_slot: Optional[TimeSlot] = None
    afternoon_slot: Optional[TimeSlot] = None
    evening_slot: Optional[TimeSlot] = None
    critique_notes: Optional[str] = None

class TripState(BaseModel):
    trip_id: str
    session_id: str
    destination: str = ""
    departure_city: str = ""
    duration_days: Optional[int] = None
    departure_time: str = ""
    budget: str = ""
    travellers: Optional[int] = None
    status: str = "planning"  # 'planning', 'validated', 'complete'
    user_constraints: Dict[str, Any] = Field(default_factory=dict)
    validation_logs: List[str] = Field(default_factory=list)
    daily_plans: List[DailyItinerary] = Field(default_factory=list)
    is_complete: bool = False

class ItineraryRequest(BaseModel):
    session_id: str
    message: str
    history: List[Dict[str, Any]] = Field(default_factory=list)
    trip_state: Optional[Dict[str, Any]] = None

class ItineraryResponse(BaseModel):
    reply: str
    trip_state: TripState
    is_complete: bool
    offer_consent: bool = False
    validation_summary: str = ""
