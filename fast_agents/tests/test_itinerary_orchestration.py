import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from fast_agents.app import app
from fast_agents.models import TripState, DailyItinerary, TimeSlot, Coordinate, ItineraryResponse

@pytest.fixture
def mock_qdrant_locations():
    """Provides standard valid grounded location coordinates for Tokyo."""
    return [
        {
            "location_id": "loc_tokyo_shinjuku",
            "name": "Shinjuku Gyoen National Garden",
            "city": "Tokyo",
            "country": "Japan",
            "latitude": 35.6852,
            "longitude": 139.7100,
            "desc": "Peaceful park and traditional gardens",
            "category": "Attraction"
        },
        {
            "location_id": "loc_tokyo_meiji",
            "name": "Meiji Jingu Shrine",
            "city": "Tokyo",
            "country": "Japan",
            "latitude": 35.6764,
            "longitude": 139.6993,
            "desc": "Historic Shinto shrine surrounded by forest",
            "category": "Historic"
        },
        {
            "location_id": "loc_tokyo_shibuya",
            "name": "Shibuya Crossing & Sky",
            "city": "Tokyo",
            "country": "Japan",
            "latitude": 35.6595,
            "longitude": 139.7005,
            "desc": "Famous pedestrian intersection and observation deck",
            "category": "Entertainment"
        }
    ]

@pytest.fixture
def mock_invalid_far_locations():
    """Provides geographically conflicting coordinates resulting in transit time > 120 mins."""
    return [
        {
            "location_id": "loc_tokyo_center",
            "name": "Tokyo Station",
            "city": "Tokyo",
            "country": "Japan",
            "latitude": 35.6812,
            "longitude": 139.7671,
            "desc": "Central railway hub",
            "category": "Transit"
        },
        {
            "location_id": "loc_remote_osaka",
            "name": "Dotonbori Osaka",
            "city": "Tokyo",
            "country": "Japan",
            "latitude": 34.6687,  # ~400 km away from Tokyo
            "longitude": 135.5013,
            "desc": "Distant intercity entertainment canal",
            "category": "Entertainment"
        },
        {
            "location_id": "loc_tokyo_roppongi",
            "name": "Roppongi Hills",
            "city": "Tokyo",
            "country": "Japan",
            "latitude": 35.6605,
            "longitude": 139.7292,
            "desc": "Urban center and observatory",
            "category": "Dining"
        }
    ]

@pytest.mark.asyncio
async def test_normal_generation_state_transitions(mock_qdrant_locations):
    """
    Test 1: Normal Generation LangGraph State Transitions
    DayPlannerAgent queries Qdrant -> LogisticsValidator verifies transit (<120m) ->
    CriticAgent approves -> Final validated TripState produced with strict schema.
    """
    payload = {
        "session_id": "sess_test_normal_001",
        "message": "Plan a 2-day trip to Tokyo departing from Delhi on Saturday 08:00 AM for $2500",
        "history": [],
        "trip_state": {
            "destination": "Tokyo",
            "departure_city": "Delhi",
            "duration_days": 2,
            "departure_time": "Saturday 08:00 AM",
            "budget": "$2500",
            "is_complete": False
        }
    }

    with patch("fast_agents.vector_db.location_store.search_locations", return_value=mock_qdrant_locations):
        with patch("fast_agents.dialog_manager.gemini_llm", None):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post("/internal/generate-itinerary", json=payload)

    assert response.status_code == 200
    data = response.json()

    # Assert response envelope
    assert data["is_complete"] is True
    assert data["offer_consent"] is True
    assert "reply" in data and len(data["reply"]) > 50

    trip_state = data["trip_state"]
    assert trip_state["destination"] == "Tokyo"
    assert trip_state["duration_days"] == 2
    assert trip_state["status"] == "validated"
    assert len(trip_state["daily_plans"]) == 2

    # Assert Worker Agent transitions logged by Supervisor
    logs_str = " ".join(trip_state["validation_logs"])
    assert "Delegating Day 1 to DayPlannerAgent" in logs_str
    assert "Logistics" in logs_str
    assert "Critic" in logs_str
    assert "passed quality and logistics audit" in logs_str

    # Strict JSON Schema Validation
    validated_state = TripState(**trip_state)
    assert validated_state.trip_id == "trip_sess_test_normal_001"
    for dp in validated_state.daily_plans:
        assert dp.validation_status == "valid"
        assert dp.morning_slot is not None
        assert dp.morning_slot.coordinates is not None
        assert dp.afternoon_slot is not None
        assert dp.evening_slot is not None


@pytest.mark.asyncio
async def test_critic_triggers_localized_reprompt_for_invalid_day(mock_invalid_far_locations, mock_qdrant_locations):
    """
    Test 2: Critic Agent Localized Re-Prompt
    When Day 1 violates physical travel time constraints (>120 mins),
    CriticAgent rejects the day and triggers localized re-prompting.
    On re-prompt, proximate locations are provided, and Day 1 succeeds with 'regenerated' status.
    """
    payload = {
        "session_id": "sess_test_reprompt_002",
        "message": "Plan a 1-day trip to Tokyo from Delhi on Sunday 09:00 AM for $1500",
        "history": [],
        "trip_state": {
            "destination": "Tokyo",
            "departure_city": "Delhi",
            "duration_days": 1,
            "departure_time": "Sunday 09:00 AM",
            "budget": "$1500"
        }
    }

    # First call to search_locations returns invalid far locations (violates transit);
    # Second call (during localized re-prompt) returns valid proximate locations.
    search_mock = MagicMock(side_effect=[mock_invalid_far_locations, mock_qdrant_locations, mock_qdrant_locations])

    with patch("fast_agents.vector_db.location_store.search_locations", search_mock):
        with patch("fast_agents.dialog_manager.gemini_llm", None):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post("/internal/generate-itinerary", json=payload)

    assert response.status_code == 200
    data = response.json()
    trip_state = data["trip_state"]

    # Assert Critic identified physical transit violation and triggered re-prompt
    logs_str = " ".join(trip_state["validation_logs"])
    assert "exceeds allowable slot threshold" in logs_str
    assert "Triggering localized re-prompt" in logs_str
    assert "successfully regenerated and verified" in logs_str

    day_1 = trip_state["daily_plans"][0]
    assert day_1["validation_status"] == "regenerated"
    assert "Regenerated via localized re-prompting" in day_1["critique_notes"]
    assert data["is_complete"] is True

    # Assert strict schema compliance
    validated_state = TripState(**trip_state)
    assert validated_state.is_complete is True


@pytest.mark.asyncio
async def test_graceful_degradation_triggers_after_3_failed_retries(mock_invalid_far_locations):
    """
    Test 3: Graceful Degradation Logic after 3 Failed Retries
    When all 3 localized re-prompt attempts fail physical validation,
    graceful degradation logic triggers: validation_status is set to 'degraded',
    critique_notes records fallback degradation, and response succeeds without unhandled exception.
    """
    payload = {
        "session_id": "sess_test_degrade_003",
        "message": "Plan a 1-day trip to Tokyo from Delhi on Sunday 09:00 AM for $1500",
        "history": [],
        "trip_state": {
            "destination": "Tokyo",
            "departure_city": "Delhi",
            "duration_days": 1,
            "departure_time": "Sunday 09:00 AM",
            "budget": "$1500"
        }
    }

    # All search_locations return the far locations causing repeated >120m transit violations
    search_mock = MagicMock(return_value=mock_invalid_far_locations)

    with patch("fast_agents.vector_db.location_store.search_locations", search_mock):
        with patch("fast_agents.dialog_manager.gemini_llm", None):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post("/internal/generate-itinerary", json=payload)

    assert response.status_code == 200
    data = response.json()
    trip_state = data["trip_state"]

    logs_str = " ".join(trip_state["validation_logs"])

    # Assert all 3 retry attempts were logged
    assert "Attempt 1/3" in logs_str
    assert "Attempt 2/3" in logs_str
    assert "Attempt 3/3" in logs_str

    # Assert graceful degradation triggered
    assert "[Graceful Degradation]" in logs_str
    assert "Applying fallback degradation" in logs_str

    day_1 = trip_state["daily_plans"][0]
    assert day_1["validation_status"] == "degraded"
    assert "Graceful degradation triggered after 3 failed retries" in day_1["critique_notes"]

    # Assert strict JSON Schema Validation still passes cleanly
    validated_state = TripState(**trip_state)
    assert validated_state.trip_id == "trip_sess_test_degrade_003"
    assert validated_state.is_complete is True


@pytest.mark.asyncio
async def test_conversational_detail_gathering_turn():
    """
    Test 4: Multi-Turn Constraint Gathering
    When only partial details are supplied, endpoint returns is_complete=False and prompts for missing items.
    """
    payload = {
        "session_id": "sess_test_dialog_004",
        "message": "I want to visit Tokyo",
        "history": [],
        "trip_state": {}
    }

    with patch("fast_agents.dialog_manager.gemini_llm", None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/internal/generate-itinerary", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["is_complete"] is False
    assert data["offer_consent"] is False
    assert "departure" in data["reply"].lower() or "departing" in data["reply"].lower()


@pytest.mark.asyncio
async def test_strict_json_schema_validation(mock_qdrant_locations):
    """
    Test 5: Explicit JSON Schema Structure Validation
    Ensures complete field-level fidelity: all slot coordinates are valid floats,
    all daily plans contain correct time slots, and response matches ItineraryResponse schema.
    """
    payload = {
        "session_id": "sess_test_schema_005",
        "message": "Plan a 1-day trip to Tokyo from Delhi on Monday 09:00 AM for $1000",
        "history": [],
        "trip_state": {
            "destination": "Tokyo",
            "departure_city": "Delhi",
            "duration_days": 1,
            "departure_time": "Monday 09:00 AM",
            "budget": "$1000"
        }
    }

    with patch("fast_agents.vector_db.location_store.search_locations", return_value=mock_qdrant_locations):
        with patch("fast_agents.dialog_manager.gemini_llm", None):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post("/internal/generate-itinerary", json=payload)

    assert response.status_code == 200
    data = response.json()

    # Validate against Pydantic ItineraryResponse schema
    response_model = ItineraryResponse(**data)
    assert isinstance(response_model.reply, str)
    assert response_model.trip_state.destination == "Tokyo"
    assert response_model.trip_state.duration_days == 1
    assert len(response_model.trip_state.daily_plans) == 1

    day = response_model.trip_state.daily_plans[0]
    for slot in [day.morning_slot, day.afternoon_slot, day.evening_slot]:
        assert slot.slot_id.startswith("slot_")
        assert isinstance(slot.location_name, str)
        assert isinstance(slot.coordinates.latitude, float)
        assert isinstance(slot.coordinates.longitude, float)
        assert slot.validation_status in ["valid", "regenerated", "degraded"]
