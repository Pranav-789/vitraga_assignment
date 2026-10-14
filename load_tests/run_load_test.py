import os
import sys
import time
import json
import signal
import subprocess
import requests

# if sys.platform == "win32":
#     try:
#         sys.stdout.reconfigure(encoding='utf-8')
#         sys.stderr.reconfigure(encoding='utf-8')
#     except Exception:
#         pass

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VENV_PYTHON = os.path.join(ROOT_DIR, "fast_agents", ".venv", "Scripts", "python.exe")
VENV_LOCUST = os.path.join(ROOT_DIR, "fast_agents", ".venv", "Scripts", "locust.exe")

NODE_SERVER_DIR = os.path.join(ROOT_DIR, "server")

def wait_for_endpoint(url, timeout=20):
    start = time.time()
    while time.time() - start < timeout:
        try:
            res = requests.get(url, timeout=1)
            if res.status_code == 200:
                return True
        except Exception:
            time.sleep(0.5)
    return False

def main():
    print("=================================================================")
    print("  MULTI-AGENT TRAVEL ORCHESTRATOR - LOAD TEST HARNESS (LOCUST)   ")
    print("=================================================================")

    print("[1/4] Starting FastAPI Compute Node (Port 8001)...")
    env_fastapi = os.environ.copy()
    env_fastapi["PORT"] = "8001"
    fastapi_proc = subprocess.Popen(
        [VENV_PYTHON, "-m", "uvicorn", "fast_agents.app:app", "--host", "127.0.0.1", "--port", "8001"],
        cwd=ROOT_DIR,
        env=env_fastapi,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    if not wait_for_endpoint("http://127.0.0.1:8001/health", timeout=15):
        print("[ERROR] FastAPI Compute Node failed to start on http://127.0.0.1:8001")
        fastapi_proc.kill()
        sys.exit(1)
    print("[OK] FastAPI Compute Node is healthy and accepting traffic.")

    print("[2/4] Starting Node.js API Gateway (Port 8000)...")
    env_node = os.environ.copy()
    env_node["PORT"] = "8000"
    env_node["PYTHON_COMPUTE_URL"] = "http://127.0.0.1:8001"
    env_node["NODE_ENV"] = "development"
    node_proc = subprocess.Popen(
        ["node", "app.js"],
        cwd=NODE_SERVER_DIR,
        env=env_node,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    if not wait_for_endpoint("http://127.0.0.1:8000/api/health", timeout=15):
        print("[ERROR] Node.js API Gateway failed to start on http://127.0.0.1:8000")
        fastapi_proc.kill()
        node_proc.kill()
        sys.exit(1)
    print("[OK] Node.js API Gateway is healthy and connected to MongoDB.")

    duration_secs = int(os.environ.get("LOAD_TEST_DURATION", "25"))
    concurrent_users = int(os.environ.get("LOAD_TEST_USERS", "100"))
    spawn_rate = int(os.environ.get("LOAD_TEST_SPAWN_RATE", "25"))
    locustfile_path = os.path.join(ROOT_DIR, "load_tests", "locustfile.py")

    print(f"[3/4] Launching Locust load test: {concurrent_users} users @ {spawn_rate}/s for {duration_secs}s...")
    locust_cmd = [
        VENV_LOCUST,
        "-f", locustfile_path,
        "--headless",
        "-u", str(concurrent_users),
        "-r", str(spawn_rate),
        "--run-time", f"{duration_secs}s",
        "--host", "http://127.0.0.1:8000"
    ]

    try:
        subprocess.run(locust_cmd, cwd=os.path.join(ROOT_DIR, "load_tests"), check=True)
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Locust finished with code {e.returncode}")
    finally:
        print("\n[4/4] Shutting down service daemons...")
        node_proc.terminate()
        fastapi_proc.terminate()
        try:
            node_proc.wait(timeout=3)
        except Exception:
            node_proc.kill()
        try:
            fastapi_proc.wait(timeout=3)
        except Exception:
            fastapi_proc.kill()
        print("[OK] Services gracefully terminated.")

if __name__ == "__main__":
    main()
