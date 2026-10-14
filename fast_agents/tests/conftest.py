import sys
import os

# Ensure repo root is on sys.path so fast_agents can be imported
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
fast_agents_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if fast_agents_dir not in sys.path:
    sys.path.insert(0, fast_agents_dir)
