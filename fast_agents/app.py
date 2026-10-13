import os
import re
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from fast_agents.models import ItineraryRequest, ItineraryResponse, TripState
from fast_agents.agents import TripSupervisor
from fast_agents.dialog_manager import process_dialog_turn, gemini_llm

load_dotenv()

app = FastAPI(title="Multi-Agent Travel Compute Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supervisor = TripSupervisor()

@app.get("/")
def root():
    return {"status": "ok", "service": "Python Compute Node (LangGraph Multi-Agent Travel Orchestration)"}

@app.get("/health")
def health():
    return {"status": "healthy", "service": "fast_agents"}

@app.post("/internal/generate-itinerary", response_model=ItineraryResponse)
async def generate_itinerary(request: ItineraryRequest):
    """
    Internal compute endpoint invoked by the Node.js API Gateway.
    Collects important trip details (destination, location of departure, 
    number of days, departure time & date, budget) one by one.
    Once all details are collected, executes the Supervisor-Worker planning loop.
    """
    session_id = request.session_id
    message = request.message
    history = request.history
    trip_state_dict = request.trip_state or {}

    # Check if this trip was already completed and this is an ongoing Q&A turn
    already_complete = trip_state_dict.get("is_complete") or trip_state_dict.get("isComplete") or False
    msg_lower = message.lower()
    is_new_trip_request = any(p in msg_lower for p in ["plan a trip to", "new trip", "another trip", "travel to", "plan another"])

    if already_complete and not is_new_trip_request:
        # Existing completed trip: answer user question conversationally
        answer = "I'm here to help with your trip details! Let me know if you need adjustments to any day's plan or local recommendations."
        if gemini_llm:
            try:
                from langchain_core.messages import SystemMessage, HumanMessage
                dest = trip_state_dict.get("destination", "your destination")
                resp = gemini_llm.invoke([
                    SystemMessage(content=f"You are a helpful travel assistant for a planned trip to {dest}. Answer the user's travel question concisely."),
                    HumanMessage(content=message)
                ])
                if resp.content:
                    answer = resp.content.strip()
            except Exception as e:
                print(f"[ComputeNode] Q&A error: {e}")

        return ItineraryResponse(
            reply=answer,
            trip_state=TripState(
                trip_id=trip_state_dict.get("trip_id") or f"trip_{session_id}",
                session_id=session_id,
                destination=trip_state_dict.get("destination", ""),
                departure_city=trip_state_dict.get("departure_city") or trip_state_dict.get("departureCity") or "",
                duration_days=trip_state_dict.get("duration_days") or trip_state_dict.get("durationDays"),
                departure_time=trip_state_dict.get("departure_time") or trip_state_dict.get("travelDate") or "",
                budget=trip_state_dict.get("budget") or "",
                status=trip_state_dict.get("status", "validated"),
                daily_plans=trip_state_dict.get("daily_plans") or trip_state_dict.get("dailyPlans") or [],
                user_constraints=trip_state_dict.get("user_constraints") or trip_state_dict.get("userConstraints") or {},
                is_complete=True
            ),
            is_complete=True,
            offer_consent=True,
            validation_summary="Trip plan already finalized. Answering follow-up query."
        )

    # If it was a completed trip and user asks for a new trip, reset trip_state_dict
    if is_new_trip_request and already_complete:
        trip_state_dict = {}

    all_collected, state, next_question = process_dialog_turn(message, history, trip_state_dict)

    if not all_collected:
        # Still collecting details one by one
        partial_state = TripState(
            trip_id=trip_state_dict.get("trip_id") or f"trip_{session_id}",
            session_id=session_id,
            destination=state.get("destination") or "",
            departure_city=state.get("departure_city") or "",
            duration_days=state.get("duration_days"),
            departure_time=state.get("departure_time") or "",
            budget=state.get("budget") or "",
            travellers=state.get("travellers"),
            status="planning",
            user_constraints=state,
            validation_logs=[f"[DialogManager] Gathering constraints: {state}"],
            daily_plans=[],
            is_complete=False
        )
        return ItineraryResponse(
            reply=next_question,
            trip_state=partial_state,
            is_complete=False,
            offer_consent=False,
            validation_summary="Gathering required travel details one by one."
        )

    # All 5 mandatory details collected! Run LangGraph Supervisor-Worker Planning Loop
    dest = state.get("destination") or "Shimla"
    duration = state.get("duration_days") or 3
    dep_city = state.get("departure_city") or "Delhi"
    dep_time = state.get("departure_time") or "Upcoming weekend at 07:00 AM"
    budget = state.get("budget") or "Moderate"
    travellers = state.get("travellers")

    trip_state = supervisor.execute_planning_loop(
        session_id=session_id,
        destination=dest,
        duration_days=duration,
        user_constraints=state,
        departure_city=dep_city,
        departure_time=dep_time,
        budget=budget,
        travellers=travellers
    )

    # Format conversational reply with Value-First offer consent trigger
    reply_lines = [
        f"Fantastic! Here is your personalized travel plan based on your preferences:\n"
        f"- **Destination:** {dest}\n"
        f"- **Departure Location:** {dep_city}\n"
        f"- **Duration:** {duration} Days\n"
        f"- **Departure Date & Time:** {dep_time}\n"
        f"- **Budget:** {budget}\n",
        f"I have created a fully fact-grounded **{duration}-Day Itinerary for {dest}**, verified against real-world transit logistics and coordinates.\n"
    ]
    
    for plan in trip_state.daily_plans:
        reply_lines.append(f"### {plan.title}")
        if plan.morning_slot:
            reply_lines.append(f"- **Morning (09:00 AM)**: {plan.morning_slot.location_name} — {plan.morning_slot.activity_description}")
        if plan.afternoon_slot:
            transit_txt = f" *(~{plan.afternoon_slot.travel_time_from_prev_mins}m transit)*" if plan.afternoon_slot.travel_time_from_prev_mins else ""
            reply_lines.append(f"- **Afternoon (02:00 PM)**: {plan.afternoon_slot.location_name}{transit_txt} — {plan.afternoon_slot.activity_description}")
        if plan.evening_slot:
            transit_txt = f" *(~{plan.evening_slot.travel_time_from_prev_mins}m transit)*" if plan.evening_slot.travel_time_from_prev_mins else ""
            reply_lines.append(f"- **Evening (07:00 PM)**: {plan.evening_slot.location_name}{transit_txt} — {plan.evening_slot.activity_description}")
        reply_lines.append("")

    reply_lines.append(
        "\n✨ **Value-First Booking Support:**\n"
        "Would you like me to share this verified itinerary with our partner agencies so they can provide you with exclusive booking quotes and perks?"
    )

    conversational_reply = "\n".join(reply_lines)

    return ItineraryResponse(
        reply=conversational_reply,
        trip_state=trip_state,
        is_complete=True,
        offer_consent=True,
        validation_summary=f"Successfully verified {len(trip_state.daily_plans)} daily plans with real-world Qdrant physical coordinates."
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("fast_agents.app:app", host="0.0.0.0", port=port, reload=True)
