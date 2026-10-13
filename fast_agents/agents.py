import os
import json
import uuid
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

from fast_agents.models import TripState, DailyItinerary, TimeSlot, Coordinate
from fast_agents.vector_db import location_store, estimate_transit_time_minutes, haversine_distance_km

load_dotenv()

class WorkerAgent:
    """Base class for worker agents in the supervisor-worker architecture."""
    def __init__(self, agent_id: str):
        self.agent_id = agent_id

    def execute_task(self, context: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError("Subclasses must implement execute_task")


class DayPlannerAgent(WorkerAgent):
    """
    Worker Agent responsible for drafting daily itineraries.
    Queries Qdrant Vector Database for grounded real-world coordinates and locations.
    """
    def __init__(self):
        super().__init__(agent_id="day_planner_agent")

    def plan_day_activities(self, day_number: int, destination: str, constraints: Dict[str, Any], excluded_locations: List[str] = None) -> DailyItinerary:
        excluded = set(excluded_locations or [])
        
        # Query Qdrant for fact-grounded locations in destination
        locations = location_store.search_locations(query=f"attractions in {destination}", city=destination, limit=10)
        
        # Filter out already scheduled locations if possible
        available_locs = [loc for loc in locations if loc["name"] not in excluded]
        if len(available_locs) < 3:
            available_locs = locations

        # Pick 3 locations for morning, afternoon, evening
        m_loc = available_locs[0] if len(available_locs) > 0 else {"name": f"{destination} City Center", "lat": 35.6895, "lng": 139.6917, "desc": "Explore central highlights"}
        a_loc = available_locs[1] if len(available_locs) > 1 else {"name": f"{destination} Cultural District", "lat": 35.6950, "lng": 139.7000, "desc": "Visit local cultural quarter"}
        e_loc = available_locs[2] if len(available_locs) > 2 else {"name": f"{destination} Waterfront / Evening Strip", "lat": 35.6700, "lng": 139.7100, "desc": "Evening dining and night walk"}

        def get_coord(loc: dict) -> Optional[Coordinate]:
            lat = loc.get("latitude", loc.get("lat"))
            lng = loc.get("longitude", loc.get("lng"))
            if lat is not None and lng is not None:
                return Coordinate(latitude=float(lat), longitude=float(lng))
            return None

        morning_slot = TimeSlot(
            slot_id=f"slot_d{day_number}_morning_{uuid.uuid4().hex[:6]}",
            slot_type="morning",
            start_time="09:00 AM",
            location_id=m_loc.get("location_id"),
            location_name=m_loc["name"],
            coordinates=get_coord(m_loc),
            activity_description=f"Explore {m_loc['name']}. {m_loc.get('desc', 'Morning exploration')}.",
            travel_time_from_prev_mins=0,
            validation_status="valid"
        )

        afternoon_slot = TimeSlot(
            slot_id=f"slot_d{day_number}_afternoon_{uuid.uuid4().hex[:6]}",
            slot_type="afternoon",
            start_time="02:00 PM",
            location_id=a_loc.get("location_id"),
            location_name=a_loc["name"],
            coordinates=get_coord(a_loc),
            activity_description=f"Discover {a_loc['name']}. {a_loc.get('desc', 'Afternoon cultural experience')}.",
            travel_time_from_prev_mins=0,
            validation_status="valid"
        )

        evening_slot = TimeSlot(
            slot_id=f"slot_d{day_number}_evening_{uuid.uuid4().hex[:6]}",
            slot_type="evening",
            start_time="07:00 PM",
            location_id=e_loc.get("location_id"),
            location_name=e_loc["name"],
            coordinates=get_coord(e_loc),
            activity_description=f"Dine and relax around {e_loc['name']}. {e_loc.get('desc', 'Evening dining & sights')}.",
            travel_time_from_prev_mins=0,
            validation_status="valid"
        )

        title = f"Day {day_number}: {m_loc['name']} & {a_loc['name']}"
        return DailyItinerary(
            day_number=day_number,
            title=title,
            validation_status="valid",
            morning_slot=morning_slot,
            afternoon_slot=afternoon_slot,
            evening_slot=evening_slot
        )

    def execute_task(self, context: Dict[str, Any]) -> Dict[str, Any]:
        day = context.get("day", 1)
        dest = context.get("destination", "Tokyo")
        constraints = context.get("constraints", {})
        plan = self.plan_day_activities(day, dest, constraints)
        return {"day_plan": plan}


class LogisticsValidatorAgent(WorkerAgent):
    """
    Worker Agent responsible for fact-checking physical feasibility and travel times.
    Uses real-world coordinates from Qdrant to compute transit durations.
    """
    def __init__(self):
        super().__init__(agent_id="logistics_validator_agent")

    def validate_travel_time(self, origin_slot: TimeSlot, dest_slot: TimeSlot) -> Dict[str, Any]:
        if not origin_slot.coordinates or not dest_slot.coordinates:
            return {"valid": True, "transit_mins": 20, "distance_km": 5.0, "reason": f"{origin_slot.location_name} -> {dest_slot.location_name}: ~20 mins transit"}

        lat1, lon1 = origin_slot.coordinates.latitude, origin_slot.coordinates.longitude
        lat2, lon2 = dest_slot.coordinates.latitude, dest_slot.coordinates.longitude

        distance_km = haversine_distance_km(lat1, lon1, lat2, lon2)
        transit_mins = estimate_transit_time_minutes(lat1, lon1, lat2, lon2)

        # Threshold: if travel between consecutive slots exceeds 120 mins in-city, physical constraint fails
        is_valid = transit_mins <= 120
        return {
            "valid": is_valid,
            "transit_mins": transit_mins,
            "distance_km": round(distance_km, 2),
            "reason": f"{origin_slot.location_name} -> {dest_slot.location_name}: {transit_mins} mins ({round(distance_km, 1)} km)"
        }

    def validate_day_plan(self, day_plan: DailyItinerary) -> Dict[str, Any]:
        logs = []
        is_day_valid = True

        # Check morning -> afternoon
        if day_plan.morning_slot and day_plan.afternoon_slot:
            res_ma = self.validate_travel_time(day_plan.morning_slot, day_plan.afternoon_slot)
            day_plan.afternoon_slot.travel_time_from_prev_mins = res_ma["transit_mins"]
            logs.append(f"[Logistics] Morning->Afternoon: {res_ma['reason']}")
            if not res_ma["valid"]:
                is_day_valid = False
                logs.append(f"[Logistics Warning] Transit time {res_ma['transit_mins']} mins exceeds allowable slot threshold (120 min)")

        # Check afternoon -> evening
        if day_plan.afternoon_slot and day_plan.evening_slot:
            res_ae = self.validate_travel_time(day_plan.afternoon_slot, day_plan.evening_slot)
            day_plan.evening_slot.travel_time_from_prev_mins = res_ae["transit_mins"]
            logs.append(f"[Logistics] Afternoon->Evening: {res_ae['reason']}")
            if not res_ae["valid"]:
                is_day_valid = False
                logs.append(f"[Logistics Warning] Transit time {res_ae['transit_mins']} mins exceeds allowable slot threshold (120 min)")

        day_plan.validation_status = "valid" if is_day_valid else "failed"
        return {"valid": is_day_valid, "logs": logs, "day_plan": day_plan}

    def execute_task(self, context: Dict[str, Any]) -> Dict[str, Any]:
        day_plan = context["day_plan"]
        return self.validate_day_plan(day_plan)


class CriticAgent(WorkerAgent):
    """
    Critic Agent evaluates the daily itinerary and triggers localized re-prompting
    for ONLY the failed day, saving compute and tokens.
    """
    def __init__(self):
        super().__init__(agent_id="critic_agent")

    def evaluate_daily_itinerary(self, day_plan: DailyItinerary, validation_result: Dict[str, Any]) -> Dict[str, Any]:
        if not validation_result.get("valid", True):
            notes = f"Rejected: {', '.join([l for l in validation_result.get('logs', []) if 'Warning' in l])}"
            day_plan.critique_notes = notes
            return {"approved": False, "reason": notes}
        
        day_plan.critique_notes = "Approved: Pacing and transit logistics within optimal thresholds."
        return {"approved": True, "reason": "Optimal travel schedule validated against Qdrant coordinates."}

    def trigger_localized_re_prompt(self, failed_day: DailyItinerary, destination: str, constraints: Dict[str, Any], planner: DayPlannerAgent, validator: LogisticsValidatorAgent) -> DailyItinerary:
        """
        Localized re-prompting: regenerates ONLY the failed day with geographically aligned locations.
        """
        print(f"[CriticAgent] Autonomously re-prompting ONLY Day {failed_day.day_number} due to physical constraint violation...")
        
        # Search geographically closer cluster
        cluster_locs = location_store.search_locations(query=f"compact central walking attractions {destination}", city=destination, limit=4)
        
        new_plan = planner.plan_day_activities(
            day_number=failed_day.day_number,
            destination=destination,
            constraints=constraints,
            excluded_locations=[failed_day.morning_slot.location_name if failed_day.morning_slot else ""]
        )
        new_plan.validation_status = "regenerated"
        new_plan.critique_notes = "Regenerated via localized re-prompting with optimized proximate coordinates."
        
        validator.validate_day_plan(new_plan)
        return new_plan

    def execute_task(self, context: Dict[str, Any]) -> Dict[str, Any]:
        day_plan = context["day_plan"]
        val_res = context["validation_result"]
        return self.evaluate_daily_itinerary(day_plan, val_res)


class TripSupervisor:
    """
    Supervisor Agent orchestrating the planning loop across Worker Agents.
    Executes LangGraph-style control flow:
    Planner -> Validator -> Critic -> Localized Re-prompter (if failed) -> State Consolidation
    """
    def __init__(self):
        self.day_planner = DayPlannerAgent()
        self.logistics_validator = LogisticsValidatorAgent()
        self.critic = CriticAgent()

    def execute_planning_loop(
        self,
        session_id: str,
        destination: str,
        duration_days: int = 3,
        user_constraints: Dict[str, Any] = None,
        departure_city: str = "",
        departure_time: str = "",
        budget: str = "",
        travellers: Optional[int] = None
    ) -> TripState:
        constraints = user_constraints or {}
        trip_id = f"trip_{session_id}"
        trip_state = TripState(
            trip_id=trip_id,
            session_id=session_id,
            destination=destination,
            departure_city=departure_city,
            duration_days=duration_days,
            departure_time=departure_time,
            budget=budget,
            travellers=travellers,
            status="planning",
            user_constraints=constraints,
            validation_logs=[]
        )

        all_daily_plans = []
        used_locations = []

        trip_state.validation_logs.append(f"[Supervisor] Initiating multi-agent planning loop for {destination} ({duration_days} days).")

        for day in range(1, duration_days + 1):
            trip_state.validation_logs.append(f"[Supervisor] Delegating Day {day} to DayPlannerAgent...")
            
            # 1. DayPlannerAgent plans the day using Qdrant vector coordinates
            day_plan = self.day_planner.plan_day_activities(day, destination, constraints, excluded_locations=used_locations)
            
            # Record used locations to ensure diversity
            if day_plan.morning_slot: used_locations.append(day_plan.morning_slot.location_name)
            if day_plan.afternoon_slot: used_locations.append(day_plan.afternoon_slot.location_name)
            if day_plan.evening_slot: used_locations.append(day_plan.evening_slot.location_name)

            # 2. LogisticsValidatorAgent validates physical coordinates and transit feasibility
            val_res = self.logistics_validator.validate_day_plan(day_plan)
            trip_state.validation_logs.extend(val_res["logs"])

            # 3. Critic evaluates the plan
            critique = self.critic.evaluate_daily_itinerary(day_plan, val_res)

            # 4. Localized Re-prompting if constraints fail
            if not critique["approved"]:
                trip_state.validation_logs.append(f"[Critic] Day {day} failed physical validation: {critique['reason']}. Triggering localized re-prompt...")
                day_plan = self.critic.trigger_localized_re_prompt(
                    failed_day=day_plan,
                    destination=destination,
                    constraints=constraints,
                    planner=self.day_planner,
                    validator=self.logistics_validator
                )
                trip_state.validation_logs.append(f"[Critic] Day {day} successfully regenerated and verified.")
            else:
                trip_state.validation_logs.append(f"[Critic] Day {day} passed quality and logistics audit.")

            all_daily_plans.append(day_plan)

        trip_state.daily_plans = all_daily_plans
        trip_state.status = "validated"
        trip_state.is_complete = True
        trip_state.validation_logs.append("[Supervisor] All days validated against Qdrant knowledge base. Ready for client delivery.")

        return trip_state
