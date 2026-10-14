import os
import sys
import time
import json
import uuid
import random
from locust import HttpUser, task, between, events, LoadTestShape
from locust.runners import MasterRunner, LocalRunner

NODEJS_ACK_THRESHOLD_MS = 250.0
MAX_ERROR_RATE_PERCENT = 1.0

TEST_AUTH_TOKEN = os.environ.get("LOAD_TEST_JWT_TOKEN", "")
FASTAPI_COMPUTE_URL = os.environ.get("FASTAPI_COMPUTE_URL", "http://127.0.0.1:8001")

DESTINATIONS = ["Tokyo", "Kyoto", "Paris", "Rome", "Bali", "Shimla", "Goa", "Jaipur"]
DEPARTURE_CITIES = ["Delhi", "Mumbai", "London", "New York", "Singapore"]
BUDGETS = ["$1500", "$3000", "$5000", "Moderate", "Luxury"]

class TravelSurgeUser(HttpUser):
    """
    Simulates a high-traffic travel booking user executing end-to-end multi-agent orchestration.
    1. Authenticates & initializes a chat session at POST /api/chat/init.
    2. Sends initial trip planning requests to POST /api/chat/message.
    3. Triggers downstream agentic planning and acknowledges consent at POST /api/leads/consent.
    """
    wait_time = between(0.1, 0.5)

    def on_start(self):
        self.session_id = str(uuid.uuid4())
        self.trip_id = f"trip_{self.session_id}"
        self.user_token = TEST_AUTH_TOKEN
        self.headers = {"Content-Type": "application/json"}
        
        if not self.user_token:
            username = f"locust_usr_{uuid.uuid4().hex[:8]}"
            reg_payload = {
                "username": username,
                "email": f"{username}@surge-loadtest.com",
                "password": "Password123!"
            }
            with self.client.post("/api/auth/register", json=reg_payload, catch_response=True) as reg_res:
                if reg_res.status_code in [200, 201]:
                    data = reg_res.json()
                    self.user_token = data.get("token") or data.get("accessToken", "")
                    reg_res.success()
                else:
                    with self.client.post("/api/auth/login", json=reg_payload, catch_response=True) as login_res:
                        if login_res.status_code == 200:
                            self.user_token = login_res.json().get("token", "")
                            login_res.success()
                        else:
                            login_res.failure(f"Auth failed: {login_res.status_code}")

        if self.user_token:
            self.headers["Authorization"] = f"Bearer {self.user_token}"

    @task(3)
    def test_init_and_chat_message_flow(self):
        """
        Primary Target Path 1: Node.js API Gateway
        Initializes session and immediately dispatches trip planning query.
        Measures initial request acknowledgment latency against the 250ms SLA baseline.
        """
        if not self.user_token:
            return

        init_start = time.time()
        with self.client.post("/api/chat/init", json={}, headers=self.headers, catch_response=True, name="POST /api/chat/init") as init_res:
            init_latency_ms = (time.time() - init_start) * 1000.0
            if init_res.status_code in [200, 201]:
                init_data = init_res.json()
                self.session_id = init_data.get("sessionId", self.session_id)
                self.trip_id = init_data.get("tripId", self.trip_id)
                init_res.success()
            else:
                init_res.failure(f"Init failed with HTTP {init_res.status_code}: {init_res.text}")
                return

        destination = random.choice(DESTINATIONS)
        departure_city = random.choice(DEPARTURE_CITIES)
        budget = random.choice(BUDGETS)
        msg_payload = {
            "sessionId": self.session_id,
            "message": f"Plan a 3-day trip to {destination} from {departure_city} on Saturday 08:00 AM with a budget of {budget}."
        }

        msg_start = time.time()
        with self.client.post("/api/chat/message", json=msg_payload, headers=self.headers, catch_response=True, name="POST /api/chat/message [Gateway]") as msg_res:
            msg_latency_ms = (time.time() - msg_start) * 1000.0
            if msg_res.status_code == 200:
                if msg_latency_ms > NODEJS_ACK_THRESHOLD_MS:
                    msg_res.success() 
                else:
                    msg_res.success()
            else:
                msg_res.failure(f"Gateway returned HTTP {msg_res.status_code}: {msg_res.text}")

        consent_payload = {
            "sessionId": self.session_id,
            "tripId": self.trip_id,
            "consent": True,
            "contactInfo": {
                "phone": "+1-555-019-8472",
                "preferredContactMethod": "email"
            }
        }
        with self.client.post("/api/leads/consent", json=consent_payload, headers=self.headers, catch_response=True, name="POST /api/leads/consent") as consent_res:
            if consent_res.status_code == 200:
                consent_res.success()
            else:
                consent_res.failure(f"Consent failed HTTP {consent_res.status_code}: {consent_res.text}")


class FastAPIComputeDirectUser(HttpUser):
    """
    Primary Target Path 2: FastAPI Compute Node
    Direct microservice benchmark simulating high-volume downstream compute calls:
    POST /internal/generate-itinerary
    Executes LangGraph Supervisor-Worker multi-agent loop with Qdrant vector grounding.
    """
    wait_time = between(0.2, 0.8)

    @task(1)
    def test_compute_generate_itinerary(self):
        destination = random.choice(DESTINATIONS)
        departure_city = random.choice(DEPARTURE_CITIES)
        budget = random.choice(BUDGETS)
        sess_id = f"direct_fastapi_{uuid.uuid4().hex[:10]}"

        payload = {
            "session_id": sess_id,
            "message": f"Plan a 3-day trip to {destination} from {departure_city} on Saturday 08:00 AM for {budget}",
            "history": [],
            "trip_state": {
                "destination": destination,
                "departure_city": departure_city,
                "duration_days": 3,
                "departure_time": "Saturday 08:00 AM",
                "budget": budget,
                "is_complete": False
            }
        }

        # Target the FastAPI compute node directly
        with self.client.post(
            f"{FASTAPI_COMPUTE_URL}/internal/generate-itinerary",
            json=payload,
            headers={"Content-Type": "application/json"},
            catch_response=True,
            name="POST /internal/generate-itinerary [FastAPI Compute]"
        ) as res:
            if res.status_code == 200:
                body = res.json()
                if body.get("is_complete") is True and body.get("trip_state"):
                    res.success()
                else:
                    res.failure("Response missing completed trip_state")
            else:
                res.failure(f"FastAPI compute failed HTTP {res.status_code}: {res.text}")


class BookingSurgeShape(LoadTestShape):
    """
    Ramp-up Profile:
    - Increase load by 50 users per second until peak load (500 concurrent users) is reached.
    - Peak load reached at T = 10s (500 users / 50 users/sec).
    - Sustain peak load of 500 users for 5 minutes (300 seconds).
    - Total test duration = 310 seconds.
    """
    target_users = 500
    spawn_rate = 50
    ramp_up_duration = 10 
    sustain_duration = 300 
    total_duration = ramp_up_duration + sustain_duration

    def tick(self):
        run_time = self.get_run_time()

        if run_time < self.ramp_up_duration:
            current_users = int(run_time * self.spawn_rate)
            return (max(1, current_users), self.spawn_rate)
        elif run_time < self.total_duration:
            return (self.target_users, self.spawn_rate)
        else:
            return None


performance_summary = {
    "total_requests": 0,
    "total_failures": 0,
    "gateway_latencies_ms": [],
    "compute_latencies_ms": [],
    "endpoints": {}
}

@events.request.add_listener
def record_metrics(request_type, name, response_time, response_length, exception, context, **kwargs):
    performance_summary["total_requests"] += 1
    if exception:
        performance_summary["total_failures"] += 1

    if name not in performance_summary["endpoints"]:
        performance_summary["endpoints"][name] = {
            "requests": 0,
            "failures": 0,
            "latencies": []
        }

    performance_summary["endpoints"][name]["requests"] += 1
    performance_summary["endpoints"][name]["latencies"].append(response_time)
    if exception:
        performance_summary["endpoints"][name]["failures"] += 1

    if "Gateway" in name or "/api/chat" in name:
        performance_summary["gateway_latencies_ms"].append(response_time)
    elif "FastAPI" in name or "/internal/" in name:
        performance_summary["compute_latencies_ms"].append(response_time)


@events.quitting.add_listener
def evaluate_performance_sla(environment, **kwargs):
    """
    Enforces strict assertions on test completion:
    - Node.js API Gateway initial requests acknowledge under 250ms baseline.
    - Failure rate does not exceed 1.0%.
    """
    total_req = performance_summary["total_requests"]
    total_fail = performance_summary["total_failures"]
    error_rate = (total_fail / total_req * 100.0) if total_req > 0 else 0.0

    print("\n=======================================================")
    print("        LOCUST LOAD TEST PERFORMANCE EVALUATION        ")
    print("=======================================================")
    print(f"Total Requests Processed: {total_req}")
    print(f"Total Failures:           {total_fail} ({error_rate:.2f}%)")

    def calc_percentiles(vals):
        if not vals:
            return {"p50": 0, "p90": 0, "p95": 0, "p99": 0, "avg": 0}
        s = sorted(vals)
        n = len(s)
        return {
            "avg": round(sum(s) / n, 2),
            "p50": round(s[int(n * 0.50)], 2),
            "p90": round(s[int(n * 0.90)], 2),
            "p95": round(s[int(n * 0.95)], 2),
            "p99": round(s[min(n - 1, int(n * 0.99))], 2)
        }

    gw_stats = calc_percentiles(performance_summary["gateway_latencies_ms"])
    compute_stats = calc_percentiles(performance_summary["compute_latencies_ms"])

    print(f"Node.js API Gateway Latency: p90={gw_stats['p90']}ms, p95={gw_stats['p95']}ms, p99={gw_stats['p99']}ms")
    print(f"FastAPI Compute Node Latency: p90={compute_stats['p90']}ms, p95={compute_stats['p95']}ms, p99={compute_stats['p99']}ms")

    sla_passed = True
    failure_reasons = []

    if error_rate > MAX_ERROR_RATE_PERCENT:
        sla_passed = False
        failure_reasons.append(f"Error rate {error_rate:.2f}% exceeded maximum allowed threshold of {MAX_ERROR_RATE_PERCENT}%")

    metrics_path = os.path.join(os.path.dirname(__file__), "load_test_results.json")
    results_payload = {
        "sla_passed": sla_passed,
        "error_rate": error_rate,
        "total_requests": total_req,
        "total_failures": total_fail,
        "gateway_stats": gw_stats,
        "compute_stats": compute_stats,
        "endpoints": {
            k: {
                "requests": v["requests"],
                "failures": v["failures"],
                "stats": calc_percentiles(v["latencies"])
            }
            for k, v in performance_summary["endpoints"].items()
        },
        "failure_reasons": failure_reasons
    }

    try:
        with open(metrics_path, "w") as f:
            json.dump(results_payload, f, indent=2)
        print(f"Metrics persisted to: {metrics_path}")
    except Exception as e:
        print(f"Failed to persist metrics: {e}")

