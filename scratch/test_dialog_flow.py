import sys
from fast_agents.dialog_manager import process_dialog_turn

# Simulate turn 5 where MongoDB only has duration as string and userConstraints didn't store duration_days:
mongo_state_no_uc = {
    "destination": "Sehore",
    "departureCity": "Bhusawal",
    "duration": "7 days", # Notice durationDays is missing!
    "travelDate": "25th october",
    "userConstraints": {}
}

history = [
    {"role": "user", "content": "25th october"},
    {"role": "assistant", "content": "Noted, departing on 25th October. What is your approximate budget for the trip (e.g. ₹20,000, or a travel style like budget, moderate, or luxury)?"}
]

all_done, state5, q5 = process_dialog_turn("100000 rupees 3 people", history, mongo_state_no_uc)
print("Turn 5 - All done?", all_done)
print("Turn 5 - State:", state5)
print("Turn 5 - Question:", q5)
