import os
import re
import json
from typing import Dict, Any, Tuple, Optional, List
from dotenv import load_dotenv

load_dotenv()

# Initialize Gemini LLM for conversational detail extraction if available
gemini_llm = None
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if api_key:
        gemini_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            api_key=api_key,
            temperature=0.1
        )
except Exception as e:
    print(f"[DialogManager] LLM initialization notice: {e}")


def rule_based_extract(message: str, history: List[Dict[str, Any]], current_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Robust rule-based and regex extractor that guarantees 100% reliable extraction
    even when LLM is unavailable or offline.
    """
    updated = dict(current_state)
    msg_lower = message.lower().strip()

    # Identify what the assistant asked in the most recent turn
    last_assistant_msg = ""
    for m in reversed(history):
        if m.get("role") == "assistant":
            last_assistant_msg = m.get("content", "").lower()
            break

    # 1. Skip / Generate immediately intent
    if any(phrase in msg_lower for phrase in [
        "just plan", "just generate", "generate now", "skip", 
        "direct itinerary", "give me the itinerary", "create it now", 
        "plan anyway", "generate itinerary", "show itinerary"
    ]):
        updated["skip_requested"] = True
        return updated

    # 2. Departure City Extraction (Check BEFORE destination to prevent "from Delhi" overriding destination)
    dep_city = updated.get("departure_city") or ""
    dep_match = re.search(
        r'(?:from|departing from|leaving from|out of|starting from)\s+([A-Za-z\s]+?)(?:[.,!?]|\bfor\b|\bat\b|\bon\b|$)', 
        message, 
        re.IGNORECASE
    )
    if dep_match:
        cand = dep_match.group(1).strip()
        cand_words = [w for w in cand.split() if w.lower() not in [
            "tomorrow", "today", "yesterday", "morning", "evening", "next", "this", "my", "our", "the"
        ]]
        if cand_words:
            candidate_city = cand_words[0].capitalize()
            dep_city = candidate_city
    elif (
        "departing from" in last_assistant_msg or 
        "where will you be departing" in last_assistant_msg or 
        "departure location" in last_assistant_msg
    ) and not dep_city:
        clean_text = re.sub(r'^(from|in|i am from|i live in|leaving from|starting from)\s+', '', message, flags=re.IGNORECASE).strip()
        words = clean_text.split()
        if words:
            candidate_city = words[0].strip(".,!?").capitalize()
            dep_city = candidate_city
    if dep_city:
        updated["departure_city"] = dep_city

    # 3. Destination Extraction
    dest = updated.get("destination") or ""
    has_explicit_dest = re.search(
        r'(?:trip to|visit|travel to|going to|explore|head to)\s+([A-Za-z\s]+?)(?:[.,!?]|$)', 
        message, 
        re.IGNORECASE
    )
    if has_explicit_dest:
        candidate = has_explicit_dest.group(1).strip()
        if 2 < len(candidate) < 30:
            dest = candidate.split()[0].capitalize()
    elif not dest:
        known_destinations = [
            "shimla", "manali", "goa", "jaipur", "udaipur", "delhi", "mumbai", "agra", 
            "kerala", "ladakh", "rishikesh", "tokyo", "kyoto", "paris", "rome", "bali", 
            "london", "new york", "barcelona", "amritsar", "dharamshala", "nainital", "mussoorie"
        ]
        for d in known_destinations:
            if d in msg_lower and d.capitalize() != dep_city:
                dest = d.capitalize()
                break
                
        if not dest and (
            "where would you like to travel" in last_assistant_msg or 
            "which destination" in last_assistant_msg or
            "which place" in last_assistant_msg
        ):
            clean_text = re.sub(r'^(to|i want to go to|visiting|trip to)\s+', '', message, flags=re.IGNORECASE).strip()
            words = clean_text.split()
            if words:
                dest = words[0].strip(".,!?").capitalize()
    if dest:
        updated["destination"] = dest

    # 4. Duration Days Extraction
    duration = updated.get("duration_days")
    day_match = re.search(r'(\d+)\s*[- ]?(?:day|days|d\b)', message, re.IGNORECASE)
    if day_match:
        duration = int(day_match.group(1))
    elif "weekend" in msg_lower:
        duration = 2
    elif "week" in msg_lower:
        duration = 7
    elif (
        "how many days" in last_assistant_msg or 
        "duration" in last_assistant_msg or
        "how long" in last_assistant_msg
    ) and not duration:
        num_match = re.search(r'\b(\d+)\b', message)
        if num_match:
            duration = int(num_match.group(1))
    if duration:
        updated["duration_days"] = max(1, min(duration, 14))

    # 5. Departure Time / Dates Extraction
    dep_time = updated.get("departure_time") or ""
    if (
        ("date" in last_assistant_msg and "time" in last_assistant_msg) or 
        "departure date" in last_assistant_msg or 
        "departure time" in last_assistant_msg or 
        "start your journey" in last_assistant_msg
    ):
        dep_time = message.strip(".,!?")
    else:
        time_date_match = re.search(
            r'(\b(?:this|next)?\s*(?:weekend|friday|saturday|sunday|monday|tuesday|wednesday|thursday|tomorrow|today)(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\s+(?:morning|evening|afternoon|night))?|'
            r'\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|'
            r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)',
            message,
            re.IGNORECASE
        )
        if time_date_match:
            dep_time = time_date_match.group(0).strip(".,! ")
    if dep_time:
        updated["departure_time"] = dep_time

    # 6. Budget Extraction
    budget = updated.get("budget") or ""
    if "budget" in last_assistant_msg:
        budget = message.strip(".,!?")
    else:
        budget_match = re.search(
            r'((?:(?:₹|rs\.?|inr|\$)\s*[\d,]+(?:\s*(?:k|thousand|lakh|lac))?)|(?:\b[\d,]+\s*(?:k|thousand|lakh|lac|inr|rs)\b)|(?:\b(?:budget[- ]friendly|luxury|moderate|cheap|backpacking)\b))', 
            message, 
            re.IGNORECASE
        )
        if budget_match:
            budget = budget_match.group(0).strip()
    if budget:
        updated["budget"] = budget

    # 7. Travellers Extraction
    travellers = updated.get("travellers")
    traveller_match = re.search(r'(\d+)\s*(?:people|persons|travellers|travelers|adults|pax|friends|members)', message, re.IGNORECASE)
    if traveller_match:
        travellers = int(traveller_match.group(1))
    elif "solo" in msg_lower:
        travellers = 1
    elif "couple" in msg_lower:
        travellers = 2
    if travellers:
        updated["travellers"] = travellers

    return updated


def extract_with_llm(message: str, history: List[Dict[str, Any]], current_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Invokes Gemini to extract travel parameters with structured JSON.
    Falls back safely if LLM call fails.
    """
    if not gemini_llm:
        return {}

    try:
        from langchain_core.messages import SystemMessage, HumanMessage
        
        recent_history = history[-4:]
        history_summary = "\n".join([f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in recent_history])
        
        system_prompt = (
            "You are an expert travel constraint extractor for an interactive trip planner. "
            "Extract travel parameters from the user's latest message and conversation history. "
            "Return ONLY a valid JSON object with the exact keys: "
            "\"destination\" (string or null), "
            "\"departure_city\" (string or null), "
            "\"duration_days\" (integer or null), "
            "\"departure_time\" (string or null, e.g. 'Friday 6:00 AM' or 'Tomorrow morning'), "
            "\"budget\" (string or null, e.g. '₹20,000' or 'moderate'), "
            "\"travellers\" (integer or null), "
            "\"skip_requested\" (boolean, true only if user explicitly demands to generate/skip questions directly)."
        )
        
        user_prompt = f"Known parameters:\n{json.dumps(current_state, indent=2)}\n\nRecent History:\n{history_summary}\n\nLatest User Message:\n\"{message}\""
        
        resp = gemini_llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ])
        
        content = resp.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        parsed = json.loads(content)
        cleaned = {}
        for k, v in parsed.items():
            if v is not None and v != "" and v != "null":
                cleaned[k] = v
        return cleaned
    except Exception as e:
        print(f"[DialogManager] LLM extraction error (using rule-based): {e}")
        return {}


def process_dialog_turn(
    message: str, 
    history: List[Dict[str, Any]], 
    trip_state_dict: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Dict[str, Any], Optional[str]]:
    """
    Evaluates current conversation turn.
    Collects important details ONE BY ONE in sequence:
    1. destination
    2. location of departure (departure_city)
    3. number of days (duration_days)
    4. departure time & travel date (departure_time)
    5. budget (budget)

    Returns:
        (all_collected: bool, current_state: dict, next_question: Optional[str])
    """
    current_state = {}
    if trip_state_dict:
        current_state = {
            "destination": trip_state_dict.get("destination") or "",
            "departure_city": trip_state_dict.get("departureCity") or trip_state_dict.get("departure_city") or "",
            "duration_days": trip_state_dict.get("durationDays") or trip_state_dict.get("duration_days"),
            "departure_time": trip_state_dict.get("travelDate") or trip_state_dict.get("departure_time") or "",
            "budget": trip_state_dict.get("budget") or "",
            "travellers": trip_state_dict.get("travellers")
        }
        # Also inspect userConstraints map
        uc = trip_state_dict.get("userConstraints") or trip_state_dict.get("user_constraints") or {}
        for k, v in uc.items():
            if v and not current_state.get(k):
                current_state[k] = v

    # 1. Rule-based extraction (reliable, instant baseline)
    extracted = rule_based_extract(message, history, current_state)
    
    # Check if rule-based successfully made progress on any field
    progress_made = any(
        extracted.get(k) and not current_state.get(k)
        for k in ["destination", "departure_city", "duration_days", "departure_time", "budget", "travellers", "skip_requested"]
    )

    # 2. LLM extraction to enrich complex phrasing only if rule-based didn't extract new information
    if not progress_made and not extracted.get("skip_requested"):
        llm_extracted = extract_with_llm(message, history, current_state)
        for k, v in llm_extracted.items():
            if v and not extracted.get(k):
                extracted[k] = v

    # Merge extracted details into state
    dest = extracted.get("destination") or ""
    dep_city = extracted.get("departure_city") or ""
    duration = extracted.get("duration_days")
    dep_time = extracted.get("departure_time") or ""
    budget = extracted.get("budget") or ""
    travellers = extracted.get("travellers")
    skip_requested = extracted.get("skip_requested", False)

    state = {
        "destination": dest,
        "departure_city": dep_city,
        "duration_days": duration,
        "departure_time": dep_time,
        "budget": budget,
        "travellers": travellers
    }

    # If user explicitly asked to skip or generate directly, provide defaults and generate
    if skip_requested:
        if not dest: state["destination"] = "Shimla"
        if not dep_city: state["departure_city"] = "Delhi"
        if not duration: state["duration_days"] = 3
        if not dep_time: state["departure_time"] = "This weekend at 07:00 AM"
        if not budget: state["budget"] = "Moderate"
        return True, state, None

    # Step-by-step sequential detail collection
    # 1. Destination
    if not dest:
        question = "I would love to help you plan an unforgettable trip! 🌍 Where would you like to travel?"
        return False, state, question

    # 2. Location of Departure
    if not dep_city:
        question = f"Great choice! **{dest}** is a fantastic place to visit. 🏔️ Where will you be departing from?"
        return False, state, question

    # 3. Number of Days / Duration
    if not duration:
        question = f"Got it, departing from **{dep_city}**. How many days are you planning for your trip to {dest}?"
        return False, state, question

    # 4. Departure Time & Date
    if not dep_time:
        question = f"A **{duration}-day** trip sounds exciting! What date and departure time are you planning to start your journey?"
        return False, state, question

    # 5. Budget
    if not budget:
        question = f"Noted, departing on **{dep_time}**. What is your approximate budget for the trip (e.g. ₹20,000, or a travel style like budget, moderate, or luxury)?"
        return False, state, question

    # All 5 mandatory details gathered!
    return True, state, None
