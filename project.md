# Multi-Agent Travel Orchestration & Lead Generation System

## 1. Project Overview

The Multi-Agent Travel Orchestration System is a decoupled, AI-driven platform designed to solve the geographic and logistical hallucinations common in Large Language Models (LLMs). By utilizing a **Supervisor-Worker agentic architecture** (via LangGraph), the system divides the cognitive load of trip planning among specialized agents that draft, fact-check, and critique travel itineraries before they reach the user.

Simultaneously, the system functions as a **Value-First Lead Generation Engine**. Rather than gatekeeping the itinerary behind a lead-capture form, the backend utilizes an observer pattern. It silently evaluates the user's travel intent, budget, and destinations in the background during the chat. Once the system delivers a fully validated, high-value itinerary, it seamlessly requests the user's consent to share their profile with verified partner agencies for booking quotes.

### Key Innovations

* **Fact-Grounded Planning:** Agents query a Qdrant Vector Database for real-world coordinates and constraints, eliminating impossible travel timelines.
* **Localized Re-prompting:** If a specific day violates physical constraints, the AI autonomously regenerates *only* the failed day, saving compute time and costs.
* **Value-First Handoff:** High-intent leads are silently scored and qualified during natural conversation, with data handed off to agencies only after trust (and the itinerary) is established.

---

## 2. API Endpoints

The system relies on a Node.js/Express API Gateway to manage user connections and an internal Python FastAPI microservice for LangGraph orchestration.

### Public Client API (Node.js/Express)

* **`POST /api/chat/init`**
* **Function:** Initializes a new chat session. Creates a blank `TripState` and an empty `LeadProfile` in MongoDB.
* **Response:** `{ sessionId: UUID, status: "ready" }`


* **`POST /api/chat/message`**
* **Function:** The core chat endpoint. It bifurcates the request:
1. Triggers the asynchronous `LeadObserver` to parse intent/budget and update the lead score.
2. Proxies the chat context to the Python Compute Node for itinerary generation.


* **Response:** Returns the conversational reply and streams the evolving `TripState` (Itinerary) back to the client.


* **`POST /api/leads/consent`**
* **Function:** Triggered when the user accepts the value-add offer to share their itinerary. Flags the MongoDB profile as `consent: true` and triggers the webhook handoff to partner agencies.
* **Payload:** `{ sessionId: UUID, consent: boolean, contactInfo: Object }`



### Internal Compute API (Python/FastAPI)

* **`POST /internal/generate-itinerary`**
* **Function:** Strictly internal endpoint called by the Node.js API Gateway. It accepts the parsed user constraints and chat history, executes the LangGraph Supervisor-Worker loop, grounds data using Qdrant, and returns a verified JSON itinerary.



---

## 3. System Diagrams

The following diagrams use **Eraser.io** syntax. You can copy and paste the code blocks directly into Eraser to generate the visual models.

### A. System Architecture (Component Diagram)

This diagram illustrates the separation of concerns between the Node.js gateway (handling UI and lead capture) and the Python compute node (handling heavy AI orchestration).

```text
title System Architecture
colorMode pastel
styleMode shadow

ReactClient [icon: monitor]

APIGateway [icon: server, label: "Node.js Express API"] {
  ChatController
  LeadObserver
}

ComputeNode [icon: cpu, label: "Python FastAPI"] {
  LangGraphSupervisor
  WorkerAgents
}

MongoDB [icon: database, label: "State & Lead DB"]
Qdrant [icon: layers, label: "Vector Database"]
AgencyWebhook [icon: send, label: "Partner Agencies"]

ReactClient > APIGateway: HTTP / WebSockets
APIGateway > LeadObserver: internal trigger
APIGateway > ComputeNode: internal HTTP POST
ComputeNode > Qdrant: semantic search (Locations)
APIGateway > MongoDB: read/write state
ComputeNode > MongoDB: read/write state
APIGateway > AgencyWebhook: dispatch lead

```

### B. Execution Flow (Sequence Diagram)

This diagram maps the "Value-First" execution, showing how background lead scoring occurs concurrently with itinerary generation.

```text
title Execution Flow
colorMode pastel
styleMode shadow
autoNumber on

order User, APIGateway, LeadObserver, Supervisor, Agents, Qdrant, Webhook

User[icon: user] > APIGateway[icon: server]: "Plan a 7-day trip to Japan"

// Forking the Process
APIGateway --> LeadObserver[icon: eye]: [Async] Fork chat context
activate LeadObserver
LeadObserver > LeadObserver: Extract budget & Update Lead Score
deactivate LeadObserver

APIGateway > Supervisor[icon: git-merge]: Request Itinerary Generation
activate Supervisor

Supervisor > Agents[icon: cpu]: Delegate to Day Planner
activate Agents
Agents > Qdrant[icon: database]: Semantic query for locations
activate Qdrant
Qdrant > Agents: Return physical coordinates
deactivate Qdrant

Agents > Agents: Validator & Critic evaluate plan

alt [label: If constraints fail] {
  Agents > Supervisor: Trigger Localized Re-prompt
  Supervisor > Agents: Re-run generation for failed day
}

Agents > Supervisor: Return Validated Itinerary
deactivate Agents

Supervisor > APIGateway: Return Final TripState
deactivate Supervisor

APIGateway > User: Return perfect Itinerary
APIGateway > User: "Want me to share this plan with partner agencies for a booking quote?"

alt [label: If User Consents] {
  User > APIGateway: "Yes, share my info"
  APIGateway > Webhook[icon: send]: Dispatch Lead Profile + Itinerary
  Webhook --> APIGateway: 200 OK
  APIGateway > User: "Agencies will contact you shortly!"
}

```

### C. Agentic Orchestration (Class Diagram)

This details the Object-Oriented design of the LangGraph state and the worker agents.

```text
title Agentic Orchestration
colorMode pastel
styleMode shadow
notation crows-foot

TripSupervisor [icon: git-merge] {
  orchestratorLLM
  activeState
  executePlanningLoop(state)
}

TripState [icon: database] {
  tripId
  userConstraints
  validationLogs
  addDailyPlan(day)
}

DailyItinerary [icon: calendar] {
  dayNumber
  morningSlot
  afternoonSlot
  eveningSlot
}

WorkerAgent [icon: cpu] {
  agentId
  sharedStateRef
  executeTask(context)
}

DayPlannerAgent [icon: edit] {
  planDayActivities(day, constraints)
}

LogisticsValidatorAgent [icon: map-pin] {
  validateTravelTime(origin, dest)
}

CriticAgent [icon: alert-triangle] {
  evaluateDailyItinerary(dayPlan)
  triggerLocalizedRePrompt(failedDay)
}

TripSupervisor 1--* WorkerAgent
TripSupervisor 1--1 TripState
TripState 1--* DailyItinerary
WorkerAgent < DayPlannerAgent
WorkerAgent < LogisticsValidatorAgent
WorkerAgent < CriticAgent

```

### D. Database Architecture (Entity-Relationship Diagram)

This models the MongoDB collections (Users, Trips, Slots) and the Qdrant knowledge base (Locations).

```text
title Database Architecture
colorMode pastel
styleMode shadow
notation crows-foot

Users [icon: user, color: purple] {
  user_id string pk
  email string
  lead_score float
  consent_given boolean
  budget_estimate float
}

Trips [icon: map, color: blue] {
  trip_id string pk
  user_id string
  destination string
  status string 
}

DailyPlans [icon: calendar, color: green] {
  day_id string pk
  trip_id string
  day_number int
  validation_status string
}

TimeSlots [icon: clock, color: orange] {
  slot_id string pk
  day_id string
  location_id string
  slot_type string 
  start_time timestamp
  activity_description text
}

AgencyHandoffs [icon: send, color: red] {
  handoff_id string pk
  user_id string
  trip_id string
  target_agency string
}

Locations [icon: map-pin, color: yellow, label: "Qdrant Vector DB"] {
  location_id string pk
  name string
  latitude float
  longitude float
  vector_embedding array
}

Users.user_id < Trips.user_id
Trips.trip_id < DailyPlans.trip_id
DailyPlans.day_id < TimeSlots.day_id
Locations.location_id < TimeSlots.location_id
Users.user_id < AgencyHandoffs.user_id
Trips.trip_id < AgencyHandoffs.trip_id

```

### E. Value-First Funnel (Activity Diagram)

This flowchart demonstrates the logic gate between generating the trip, evaluating the lead, and asking for consent.

```text
title Value-First Lead Flow
colorMode pastel
styleMode shadow
direction down

Start[shape: oval, label: "START"]
GenerateSession[label: "Initialize Chat\n(React/Node.js)"]
AnalyzeMessage[label: "Analyze Message\n(LangChain)"]
IsRelevant[icon: flag, label: "Is message\nrelevant?"]
PolitelyRefuse[label: "Politely Refuse\nNon-Travel Query"]

PlanChat[label: "Conduct Multi-Agent\nPlanning (LangGraph)"]
HiddenAnalysis[label: "Hidden Analysis &\nLead Scoring (Node.js)"]
StoreConversation[label: "Store State\n(MongoDB)"]

IsItineraryPresented[icon: flag, label: "Is Itinerary\nComplete?"]
PresentItinerary[label: "Stream Updates\n(React UI)"]

RequestConsent[label: "Value Offer: Request\nConsent to Share with Agencies"]
WaitInput[label: "Wait for User Input"]

IsConsentProvided[icon: flag, label: "Is Consent\nProvided?"]
ShowExit[label: "End Chat\n(No Handoff)"]

UpdateConsent[label: "Update Consent Status\nin MongoDB"]
VerifyContact[label: "Verify Contact Info"]
ShareDetails[label: "Dispatch Webhook to\nPartner Agencies"]

End[shape: oval, label: "END"]

Start > GenerateSession
GenerateSession > AnalyzeMessage
AnalyzeMessage > IsRelevant

IsRelevant > PolitelyRefuse: NO
PolitelyRefuse > AnalyzeMessage

IsRelevant > PlanChat: YES
PlanChat --> HiddenAnalysis
PlanChat > StoreConversation
HiddenAnalysis --> StoreConversation

StoreConversation > IsItineraryPresented

IsItineraryPresented > PresentItinerary: NO
PresentItinerary > AnalyzeMessage

IsItineraryPresented > RequestConsent: YES
RequestConsent > WaitInput
WaitInput > IsConsentProvided

IsConsentProvided > ShowExit: NO
ShowExit > End

IsConsentProvided > UpdateConsent: YES
UpdateConsent > VerifyContact
VerifyContact > ShareDetails
ShareDetails > End

```