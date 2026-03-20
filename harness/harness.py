#!/usr/bin/env python3
"""
Pipeline Score Harness v2.0
Run the benchmark on your own agent stack and submit scores.
"""

import json
import os
import re
import sys
import hashlib
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import click
import requests
import psutil
import yaml
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()

# Version
VERSION = "2.0.0"
PIPELINESCORE_API_URL = "https://api.pipelinescore.ai/api/submit"

# ── Tier system ─────────────────────────────────────────────────────────────
TIERS = [
    (80, "LOBSTER", "🦞", "This stack slaps.",            "bold red"),
    (50, "CHEF",    "👨‍🍳", "Something's cooking.",        "bold yellow"),
    (10, "SHRIMP",  "🦐", "Needs more seasoning.",        "yellow"),
    (0,  "💩",      "💩", "We don't talk about this run.", "dim"),
]

def get_tier(score: int) -> tuple:
    """Return (name, emoji, tagline, style) for a pipeline score."""
    for threshold, name, emoji, tagline, style in TIERS:
        if score >= threshold:
            return name, emoji, tagline, style
    return TIERS[-1][1], TIERS[-1][2], TIERS[-1][3], TIERS[-1][4]


class TeamConfig:
    """Load and validate team configuration."""
    
    REQUIRED_TEAM_FIELDS = ["name", "owner_email"]
    REQUIRED_AGENT_FIELDS = ["name", "role", "provider", "model", "endpoint"]
    VALID_ROLES = ["orchestrator", "researcher", "analyst", "coder", "communicator"]
    VALID_PROVIDERS = ["anthropic", "openai", "ollama", "openai-compatible"]
    
    def __init__(self, config: dict):
        self.config = config
        self._validate()
    
    @classmethod
    def load(cls, config_path: str) -> "TeamConfig":
        """Load config from YAML file."""
        path = Path(config_path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        
        with open(path) as f:
            config = yaml.safe_load(f)
        
        return cls(config)
    
    def _validate(self):
        """Validate required fields."""
        team = self.config.get("team", {})
        for field in self.REQUIRED_TEAM_FIELDS:
            if not team.get(field):
                raise ValueError(f"Missing required field: team.{field}")
        
        agents = self.config.get("agents", [])
        if not agents:
            raise ValueError("No agents defined in config")
        
        for i, agent in enumerate(agents):
            for field in self.REQUIRED_AGENT_FIELDS:
                if not agent.get(field):
                    raise ValueError(f"Missing required field: agents[{i}].{field}")
            
            if agent["role"] not in self.VALID_ROLES:
                raise ValueError(f"Invalid role: {agent['role']}")
            
            if agent["provider"] not in self.VALID_PROVIDERS:
                raise ValueError(f"Invalid provider: {agent['provider']}")
    
    def get_agents_by_role(self) -> dict:
        """Get agents indexed by role."""
        result = {}
        for agent in self.config.get("agents", []):
            result[agent["role"]] = agent
        return result
    
    def get_orchestrator(self) -> Optional[dict]:
        """Get the orchestrator agent (best model)."""
        for agent in self.config.get("agents", []):
            if agent["role"] == "orchestrator":
                return agent
        return self.config.get("agents", [None])[0]
    
    def get_api_key(self, env_var: str) -> Optional[str]:
        """Resolve API key from environment variable."""
        if not env_var:
            return None
        return os.environ.get(env_var)


class HardwareCollector:
    """Collect system hardware information."""
    
    @staticmethod
    def collect() -> dict:
        """Collect hardware info."""
        info = {
            "os": platform.system() + " " + platform.release(),
            "arch": platform.machine(),
            "python_version": platform.python_version(),
        }
        
        # CPU info
        info["cpu"] = platform.processor() or "Unknown"
        try:
            info["ram_gb"] = round(psutil.virtual_memory().total / (1024**3), 1)
        except Exception:
            info["ram_gb"] = "Unknown"
        
        # GPU info
        info["gpu"] = HardwareCollector._get_gpu_info()
        
        return info
    
    @staticmethod
    def _get_gpu_info() -> str:
        """Get GPU info based on OS."""
        system = platform.system()
        
        if system == "Darwin":  # macOS
            try:
                result = subprocess.run(
                    ["system_profiler", "SPDisplaysDataType"],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode == 0:
                    lines = result.stdout.split("\n")
                    for i, line in enumerate(lines):
                        if "Chip" in line or "Model" in line:
                            return line.strip()
            except Exception:
                pass
            return "Apple GPU (integrated)"
        
        elif system == "Linux":
            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode == 0 and result.stdout.strip():
                    return result.stdout.strip().split("\n")[0]
            except Exception:
                pass
            return "Unknown"
        
        elif system == "Windows":
            try:
                result = subprocess.run(
                    ["wmic", "path", "win32_VideoController", "get", "name"],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode == 0:
                    lines = [l.strip() for l in result.stdout.split("\n") if l.strip()]
                    if len(lines) > 1:
                        return lines[1]
            except Exception:
                pass
            return "Unknown"
        
        return "Unknown"


class ModelVerifier:
    """Verify that declared models are accessible."""
    
    def __init__(self, config: TeamConfig):
        self.config = config
    
    def verify(self) -> dict:
        """Verify all model endpoints."""
        results = {}
        
        for agent in self.config.config.get("agents", []):
            name = agent["name"]
            provider = agent["provider"]
            model = agent["model"]
            endpoint = agent["endpoint"]
            api_key_env = agent.get("api_key_env")
            
            verified = False
            found_model = None
            error = None
            
            try:
                if provider == "ollama":
                    found_model = self._verify_ollama(endpoint, model)
                elif provider == "openai-compatible":
                    found_model = self._verify_openai_compatible(endpoint, model)
                elif provider == "anthropic":
                    found_model = self._verify_anthropic(model, api_key_env, self.config)
                elif provider == "openai":
                    found_model = self._verify_openai(model, api_key_env, self.config)
                
                verified = found_model is not None
            except Exception as e:
                error = str(e)
            
            results[name] = {
                "declared": model,
                "found": found_model,
                "verified": verified,
                "error": error
            }
        
        return results
    
    def _verify_ollama(self, endpoint: str, model: str) -> Optional[str]:
        """Verify Ollama model."""
        url = f"{endpoint.rstrip('/')}/api/tags"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        
        models = resp.json().get("models", [])
        for m in models:
            if m.get("name", "").startswith(model):
                return m["name"]
        
        # Check partial match
        model_base = model.split(":")[0]
        for m in models:
            if model_base in m.get("name", ""):
                return m["name"]
        
        return None
    
    def _verify_openai_compatible(self, endpoint: str, model: str) -> Optional[str]:
        """Verify OpenAI-compatible model."""
        url = f"{endpoint.rstrip('/')}/v1/models"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        
        models = resp.json().get("data", [])
        for m in models:
            if m.get("id") == model:
                return m["id"]
        
        return None
    
    def _verify_anthropic(self, model: str, api_key_env: Optional[str], config: TeamConfig) -> Optional[str]:
        """Verify Anthropic model."""
        api_key = config.get_api_key(api_key_env) if api_key_env else None
        if not api_key:
            return None
        
        url = "https://api.anthropic.com/v1/models"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            return model  # Anthropic doesn't have a list endpoint for all models
        
        return None
    
    def _verify_openai(self, model: str, api_key_env: Optional[str], config: TeamConfig) -> Optional[str]:
        """Verify OpenAI model."""
        api_key = config.get_api_key(api_key_env) if api_key_env else None
        if not api_key:
            return None
        
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            models = resp.json().get("data", [])
            for m in models:
                if m.get("id") == model:
                    return m["id"]
        
        return None


class TaskRunner:
    """Run benchmark tasks."""
    
    def __init__(self, config: TeamConfig, tasks_path: str):
        self.config = config
        self.tasks = self._load_tasks(tasks_path)
    
    def _load_tasks(self, tasks_path: str) -> dict:
        """Load tasks from JSON file."""
        with open(tasks_path) as f:
            return json.load(f)
    
    def run_single(self, task_id: str) -> dict:
        """Run a single task."""
        task = self._find_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        if task["type"] == "pipeline":
            return self._run_pipeline(task)
        else:
            return self._run_single_task(task)
    
    def run_all(self) -> dict:
        """Run all non-pipeline tasks."""
        results = {}
        
        for task in self.tasks.get("tasks", []):
            if task["type"] == "single":
                task_id = task["id"]
                console.print(f"[cyan]Running {task_id}: {task['name']}...[/cyan]")
                results[task_id] = self._run_single_task(task)
        
        return results
    
    def _run_single_task(self, task: dict) -> dict:
        """Run a single (non-pipeline) task."""
        # Get appropriate agent (use orchestrator for single tasks)
        agent = self.config.get_orchestrator()
        
        start_time = time.time()
        response = self._call_agent(agent, task["prompt"])
        elapsed = time.time() - start_time
        
        # Estimate tokens
        input_tokens = len(task["prompt"].split()) * 1.3
        output_tokens = len(response.split()) * 1.3
        
        return {
            "task_id": task["id"],
            "task_name": task["name"],
            "response": response,
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "elapsed_seconds": round(elapsed, 2),
            "agent": agent["name"]
        }
    
    def _run_pipeline(self, task: dict) -> dict:
        """Run a pipeline task with multiple stages."""
        agents_by_role = self.config.get_agents_by_role()
        stages = task.get("stages", [])
        
        stage_results = []
        context = {}
        
        for stage in stages:
            role = stage["role"]
            agent = agents_by_role.get(role) or self.config.get_orchestrator()
            
            # Build prompt with context from previous stages
            # Use safe replacement (not .format) to avoid issues with LLM outputs containing {}
            prompt = stage["prompt"]
            if context:
                for key, value in context.items():
                    prompt = prompt.replace('{' + key + '}', str(value))
            
            start_time = time.time()
            response = self._call_agent(agent, prompt)
            # Retry once if response is empty or suspiciously short
            if len(response.strip()) < 50:
                console.print(f"[yellow]  Warning: {stage['id']} returned short response ({len(response.strip())} chars), retrying...[/yellow]")
                response = self._call_agent(agent, prompt)
            elapsed = time.time() - start_time
            
            # Store context for next stage (use stage id, not role name)
            context[f"{stage['id']}_output"] = response
            context[f"{role}_output"] = response  # also store by role as fallback
            
            input_tokens = len(prompt.split()) * 1.3
            output_tokens = len(response.split()) * 1.3
            
            stage_results.append({
                "stage_id": stage["id"],
                "role": role,
                "agent": agent["name"],
                "response": response,
                "input_tokens": int(input_tokens),
                "output_tokens": int(output_tokens),
                "elapsed_seconds": round(elapsed, 2)
            })
        
        total_time = sum(s["elapsed_seconds"] for s in stage_results)
        total_tokens = sum(s["input_tokens"] + s["output_tokens"] for s in stage_results)
        
        return {
            "task_id": task["id"],
            "task_name": task["name"],
            "type": "pipeline",
            "stages": stage_results,
            "total_elapsed_seconds": round(total_time, 2),
            "total_tokens": int(total_tokens)
        }
    
    def _call_agent(self, agent: dict, prompt: str) -> str:
        """Call an agent API and return response."""
        provider = agent["provider"]
        model = agent["model"]
        endpoint = agent["endpoint"]
        
        if provider == "ollama":
            return self._call_ollama(endpoint, model, prompt)
        elif provider == "anthropic":
            return self._call_anthropic(agent, prompt)
        elif provider == "openai":
            return self._call_openai(agent, prompt)
        elif provider == "openai-compatible":
            return self._call_openai_compatible(agent, prompt)
        
        raise ValueError(f"Unknown provider: {provider}")
    
    def _call_ollama(self, endpoint: str, model: str, prompt: str) -> str:
        """Call Ollama API via generate endpoint."""
        url = f"{endpoint.rstrip('/')}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 4096,
                "num_ctx": 32768,
                "temperature": 0.4
            }
        }
        resp = requests.post(url, json=payload, timeout=600)
        resp.raise_for_status()
        return resp.json().get("response", "")
    
    def _call_anthropic(self, agent: dict, prompt: str) -> str:
        """Call Anthropic API."""
        api_key = self.config.get_api_key(agent.get("api_key_env"))
        if not api_key:
            raise ValueError(f"Missing API key for {agent['name']}")
        
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        body = {
            "model": agent["model"],
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        resp = requests.post(url, headers=headers, json=body, timeout=600)
        resp.raise_for_status()
        
        data = resp.json()
        return data.get("content", [{}])[0].get("text", "")
    
    def _call_openai(self, agent: dict, prompt: str) -> str:
        """Call OpenAI API."""
        api_key = self.config.get_api_key(agent.get("api_key_env"))
        if not api_key:
            raise ValueError(f"Missing API key for {agent['name']}")
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        body = {
            "model": agent["model"],
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 4096
        }
        
        resp = requests.post(url, headers=headers, json=body, timeout=600)
        resp.raise_for_status()
        
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    
    def _call_openai_compatible(self, agent: dict, prompt: str) -> str:
        """Call OpenAI-compatible API."""
        api_key = self.config.get_api_key(agent.get("api_key_env")) or "dummy"
        
        url = f"{agent['endpoint'].rstrip('/')}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        body = {
            "model": agent["model"],
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 4096
        }
        
        resp = requests.post(url, headers=headers, json=body, timeout=600)
        resp.raise_for_status()
        
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    
    def _find_task(self, task_id: str) -> Optional[dict]:
        """Find a task by ID."""
        for task in self.tasks.get("tasks", []):
            if task["id"] == task_id:
                return task
        return None


class Scorer:
    """Score task outputs using LLM-as-judge."""
    
    def __init__(self, config: TeamConfig, rubrics_path: str):
        self.config = config
        self.rubrics = self._load_rubrics(rubrics_path)
    
    def _load_rubrics(self, path: str) -> dict:
        """Load scoring rubrics."""
        with open(path) as f:
            return json.load(f)
    
    def score(self, pipeline_result: dict, task_results: dict) -> dict:
        """Score all results."""
        scores = {}
        
        # Score pipeline
        if pipeline_result:
            scores["pipeline"] = self._score_pipeline(pipeline_result)
        
        # Score individual tasks
        for task_id, result in task_results.items():
            scores[task_id] = self._score_task(result)
        
        return scores
    
    def _score_pipeline(self, result: dict) -> int:
        """Score pipeline output using LLM judge."""
        rubric = self.rubrics.get("pipeline_rubric", self.rubrics.get("default_rubric"))
        
        # Build the full output to evaluate
        full_output = f"Pipeline: {result.get('task_name')}\n\n"
        for stage in result.get("stages", []):
            full_output += f"=== {stage['stage_id']} ({stage['role']}) ===\n{stage['response']}\n\n"
        
        # Use orchestrator as judge
        judge = self.config.get_orchestrator()
        
        json_instruction = '\n\nRespond with ONLY valid JSON in this exact format (no markdown, no explanation):\n{"score": <integer 0-100>, "reasoning": "<one sentence>"}'
        scoring_prompt = f"{rubric}\n\nOutput to evaluate:\n{full_output}{json_instruction}"
        
        response = self._call_judge(judge, scoring_prompt)
        
        import re
        try:
            json_match = re.search(r'\{[^}]+\}', response, re.DOTALL)
            if json_match:
                score_data = json.loads(json_match.group())
                return score_data.get("score", 50)
        except Exception:
            pass
        
        # Fallback: find any number 0-100 in response
        numbers = re.findall(r'\b(100|[1-9][0-9]|[1-9])\b', response)
        if numbers:
            return int(numbers[0])
        
        return 50  # Default if parsing fails
    
    def _score_task(self, result: dict) -> int:
        """Score individual task output."""
        import re
        rubric = self.rubrics.get("default_rubric")
        
        json_instruction = '\n\nRespond with ONLY valid JSON in this exact format (no markdown, no explanation):\n{"score": <integer 0-100>, "reasoning": "<one sentence>"}'
        scoring_prompt = f"{rubric}\n\nOutput to evaluate:\n{result.get('response', '')}{json_instruction}"
        
        judge = self.config.get_orchestrator()
        response = self._call_judge(judge, scoring_prompt)
        
        try:
            json_match = re.search(r'\{[^}]+\}', response, re.DOTALL)
            if json_match:
                score_data = json.loads(json_match.group())
                return score_data.get("score", 50)
        except Exception:
            pass
        
        numbers = re.findall(r'\b(100|[1-9][0-9]|[1-9])\b', response)
        if numbers:
            return int(numbers[0])
        
        return 50
    
    def _call_judge(self, judge: dict, prompt: str) -> str:
        """Call judge agent for scoring at temperature=0 for deterministic results."""
        api_key = self.config.get_api_key(judge.get("api_key_env"))
        # Only use native Anthropic path if provider is explicitly anthropic
        if not api_key or judge.get("provider") != "anthropic":
            # Route through _call_agent to respect provider config (proxy, openai-compatible, etc.)
            task_runner = TaskRunner.__new__(TaskRunner)
            task_runner.config = self.config
            return task_runner._call_agent(judge, prompt)

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        body = {
            "model": judge["model"],
            "max_tokens": 512,
            "temperature": 0,   # Deterministic — same output every time
            "messages": [{"role": "user", "content": prompt}]
        }
        resp = requests.post(url, headers=headers, json=body, timeout=60)
        resp.raise_for_status()
        return resp.json().get("content", [{}])[0].get("text", "")


class ResultBundler:
    """Bundle all results for submission."""
    
    def __init__(self, config: TeamConfig, hardware: dict, verification: dict, scores: dict):
        self.config = config
        self.hardware = hardware
        self.verification = verification
        self.scores = scores
    
    def build(self, raw_results: dict = None) -> dict:
        """Build the final submission bundle."""
        bundle = {
            "version": VERSION,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "team": {
                "name": self.config.config.get("team", {}).get("name"),
                "owner_email": self.config.config.get("team", {}).get("owner_email"),
                "description": self.config.config.get("team", {}).get("description"),
                "agents": self.config.config.get("agents", [])
            },
            "hardware": self.hardware,
            "model_verification": self.verification,
            "scores": self.scores,
            "raw_results": raw_results or {}
        }
        
        # Add signature
        bundle["signature"] = self._sign(bundle)
        
        return bundle
    
    def _sign(self, bundle: dict) -> str:
        """Sign the bundle with API key."""
        api_key_env = self.config.config.get("pipelinescore", {}).get("api_key_env")
        api_key = self.config.get_api_key(api_key_env) or "demo_key"
        
        # Create signature from bundle without signature field
        data = {k: v for k, v in bundle.items() if k != "signature"}
        data_str = json.dumps(data, sort_keys=True) + api_key
        
        hash_val = hashlib.sha256(data_str.encode()).hexdigest()
        return f"sha256:{hash_val}"


class Submitter:
    """Submit results to Pipeline Score API."""
    
    def __init__(self, config: TeamConfig, local: bool = False):
        self.config = config
        self.local = local
    
    def submit(self, bundle: dict, dry_run: bool = False) -> dict:
        """Submit bundle to pipelinescore.ai via secure API. No CF credentials in binary."""
        if dry_run:
            console.print("[yellow]DRY RUN - Not actually submitting[/yellow]")
            return {"id": "dry-run", "rank": None, "url": None}

        api_key_env = self.config.config.get("pipelinescore", {}).get("api_key_env")
        api_key = self.config.get_api_key(api_key_env) or os.environ.get("PIPELINESCORE_API_KEY", "")

        try:
            resp = requests.post(
                "https://pipelinescore.ai/api/submit",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=bundle,
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            run_number = data.get("run_number", "?")
            rank = data.get("rank")
            score = data.get("pipeline_score", bundle.get("scores", {}).get("pipeline"))
            result_url = data.get("result_url", "https://pipelinescore.ai")
            console.print(f"[green]✅ Submitted! Run #{run_number} · Score: {score}/100 · Rank: #{rank}[/green]")
            return {
                "status": "submitted",
                "id": data.get("submission_id", ""),
                "run_number": run_number,
                "rank": rank,
                "pipeline_score": score,
                "url": result_url,
            }

        except Exception as e:
            console.print(f"[red]Submission failed: {e}[/red]")
            results_dir = Path("results")
            results_dir.mkdir(exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d-%H%M%S")
            local_path = results_dir / f"submission-{ts}.json"
            with open(local_path, "w") as f:
                json.dump(bundle, f, indent=2)
            console.print(f"[yellow]Saved locally to {local_path}[/yellow]")
            return {"status": "local", "id": f"local-{ts}", "rank": None, "url": "https://pipelinescore.ai"}


@click.command()
@click.option("--config", "-c", help="Path to team.yaml config file")
@click.option("--task", "-t", help="Run a specific task by ID")
@click.option("--verify", "-v", is_flag=True, help="Verify model endpoints only")
@click.option("--dry-run", is_flag=True, help="Test config without running benchmark")
@click.option("--local", is_flag=True, help="Use local API endpoint")
@click.option("--version", is_flag=True, help="Show version")
def main(config, task, verify, dry_run, local, version):
    """Pipeline Score Harness - Run benchmarks on your agent stack."""
    
    if version:
        console.print(f"[bold]Pipeline Score Harness[/bold] v{VERSION}")
        return
    
    if not config:
        console.print("[red]Error: --config required[/red]")
        console.print("Usage: python harness.py --config team.yaml")
        sys.exit(1)
    
    # Determine paths relative to this script
    script_dir = Path(__file__).parent
    tasks_path = script_dir / "tasks" / "tasks.json"
    rubrics_path = script_dir / "tasks" / "rubrics.json"
    
    console.print(f"[bold]Pipeline Score Harness v{VERSION}[/bold]")

    # Auto-register if no API key is set (UserBenchmark-style: just run it)
    _ps_key_file = Path.home() / ".pipelinescore_key"
    if not os.environ.get("PIPELINESCORE_API_KEY") and not _ps_key_file.exists():
        console.print("\n[bold cyan]First run detected![/bold cyan] Let's get you set up.\n")
        _nickname = console.input("[cyan]Team nickname[/cyan] (e.g. 'My Llama Stack'): ").strip()
        _email = console.input("[cyan]Email address[/cyan] (for your results page): ").strip()
        if _nickname and _email:
            try:
                _reg_resp = requests.post(
                    "https://pipelinescore.ai/api/register",
                    json={"nickname": _nickname, "email": _email},
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                _reg_data = _reg_resp.json() if _reg_resp.ok else {}
                _new_key = _reg_data.get("api_key")
                if _new_key:
                    _ps_key_file.write_text(_new_key)
                    os.environ["PIPELINESCORE_API_KEY"] = _new_key
                    console.print(f"[green]✓[/green] Registered! Key saved to ~/.pipelinescore_key\n")
                else:
                    console.print("[yellow]⚠ Could not auto-register — run will proceed and save locally.[/yellow]\n")
            except Exception:
                console.print("[yellow]⚠ Registration skipped (offline?) — results will save locally.[/yellow]\n")
    elif _ps_key_file.exists() and not os.environ.get("PIPELINESCORE_API_KEY"):
        os.environ["PIPELINESCORE_API_KEY"] = _ps_key_file.read_text().strip()

    # Load config
    try:
        team_config = TeamConfig.load(config)
        console.print(f"[green]✓[/green] Loaded config: {team_config.config.get('team', {}).get('name')}")
    except Exception as e:
        console.print(f"[red]Error loading config: {e}[/red]")
        sys.exit(1)
    
    # Collect hardware
    hardware = HardwareCollector.collect()
    console.print(f"[green]✓[/green] Hardware: {hardware['cpu']}, {hardware['ram_gb']}GB RAM")
    
    # Verify models
    console.print("[cyan]🔍 Verifying model endpoints...[/cyan]")
    verifier = ModelVerifier(team_config)
    verification = verifier.verify()
    
    all_verified = all(v.get("verified", False) for v in verification.values())
    for name, result in verification.items():
        status = "[green]✓[/green]" if result["verified"] else "[red]✗"
        found = result.get("found", "NOT FOUND")
        console.print(f"  {status} {name}: {result['declared']} -> {found}")
    
    if verify:
        return
    
    if not all_verified and not dry_run:
        console.print("[yellow]Warning: Some models not verified. Results may be affected.[/yellow]")
    
    # Initialize components
    task_runner = TaskRunner(team_config, str(tasks_path))
    scorer = Scorer(team_config, str(rubrics_path))
    
    raw_results = {}
    
    # ── Live status display ──────────────────────────────────────────────
    from rich.live import Live
    from rich.table import Table
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.text import Text
    import time as _time

    TASK_LABELS = {
        "pipeline":       ("🔗 Pipeline Test",    "Flagship — 4-stage team coordination"),
        "extraction_001": ("📋 Extraction",        "Structured data from text"),
        "code_001":       ("💻 Code Generation",   "Working Python from spec"),
        "reasoning_001":  ("🧠 Reasoning",         "Multi-step logical deduction"),
        "research_001":   ("🔍 Research",          "Source-grounded synthesis"),
        "multitool_001":  ("🔧 Multi-Tool",        "Chained tool orchestration"),
        "bugfix_001":     ("🐛 Bug Fix",           "Root cause identification"),
        "docreview_001":  ("📄 Doc Review",        "Clause-level comprehension"),
        "rtresearch_001":("🌐 RT Research",       "Live web data retrieval"),
        "adversarial_001":("🛡️  Adversarial",      "Resist prompt injection"),
    }
    TASK_ORDER = list(TASK_LABELS.keys())

    task_status = {k: {"state": "pending", "score": None, "elapsed": None} for k in TASK_ORDER}
    run_start = _time.time()

    def score_color(s):
        if s is None: return "dim"
        return "green" if s >= 80 else "yellow" if s >= 60 else "red"

    def build_table():
        elapsed = int(_time.time() - run_start)
        mins, secs = divmod(elapsed, 60)
        table = Table(box=None, padding=(0, 2), show_header=True, header_style="dim")
        table.add_column("Task", style="white", no_wrap=True, width=26)
        table.add_column("Description", style="dim", width=32)
        table.add_column("Status", justify="center", width=12)
        table.add_column("Score", justify="right", width=10)
        table.add_column("Time", justify="right", width=8)

        for key in TASK_ORDER:
            label, desc = TASK_LABELS[key]
            info = task_status[key]
            state = info["state"]
            score = info["score"]
            elapsed_t = info["elapsed"]

            if state == "running":
                status_txt = Text("● Running", style="cyan")
            elif state == "scoring":
                status_txt = Text("◌ Scoring", style="yellow")
            elif state == "done":
                status_txt = Text("✓ Done", style="green")
            else:
                status_txt = Text("○ Waiting", style="dim")

            score_txt = Text(f"{score}/100" if score is not None else "—", style=score_color(score))
            time_txt = Text(f"{elapsed_t:.0f}s" if elapsed_t else "—", style="dim")
            table.add_row(label, desc, status_txt, score_txt, time_txt)

        header = Text(f"Pipeline Score Harness v{VERSION}  ·  {team_config.config.get('team',{}).get('name','')}  ·  Elapsed {mins:02d}:{secs:02d}", style="bold white")
        return Panel(table, title=header, border_style="bright_black", padding=(1, 2))

    scores = {}

    with Live(build_table(), refresh_per_second=4, console=console) as live:

        # ── Pipeline test ────────────────────────────────────────────
        task_status["pipeline"]["state"] = "running"
        live.update(build_table())
        t0 = _time.time()

        pipeline_task = task_runner._find_task("pipeline_001")
        if pipeline_task:
            pipeline_result = task_runner._run_pipeline(pipeline_task)
            raw_results["pipeline"] = pipeline_result
            task_status["pipeline"]["elapsed"] = _time.time() - t0

            task_status["pipeline"]["state"] = "scoring"
            live.update(build_table())

            pipeline_score = scorer._score_pipeline(pipeline_result)
            scores["pipeline"] = pipeline_score
            task_status["pipeline"]["score"] = pipeline_score
            task_status["pipeline"]["state"] = "done"
            live.update(build_table())

        # ── Supporting tasks ─────────────────────────────────────────
        task_results = {}
        for task in task_runner.tasks.get("tasks", []):
            if task["type"] != "single":
                continue
            tid = task["id"]
            task_status[tid]["state"] = "running"
            live.update(build_table())
            t0 = _time.time()

            result = task_runner._run_single_task(task)
            task_results[tid] = result
            task_status[tid]["elapsed"] = _time.time() - t0

            task_status[tid]["state"] = "scoring"
            live.update(build_table())

            task_score = scorer._score_task(result)
            scores[tid] = task_score
            task_status[tid]["score"] = task_score
            task_status[tid]["state"] = "done"
            live.update(build_table())

        raw_results["tasks"] = task_results

    # ─────────────────────────────────────────────────────────────────
    
    # Scores already collected inline during Live display — print summary
    console.print()
    
    # Bundle results
    bundler = ResultBundler(team_config, hardware, verification, scores)
    bundle = bundler.build(raw_results)
    
    # Submit
    console.print("[cyan]📤 Submitting to Pipeline Score...[/cyan]")
    submitter = Submitter(team_config, local)
    submission = submitter.submit(bundle, dry_run)
    
    # ── Result card ──────────────────────────────────────────────────────
    from rich.panel import Panel as _Panel
    from rich.text import Text as _Text
    from rich.align import Align as _Align
    from rich.columns import Columns as _Columns

    pipeline_score = scores.get("pipeline", 0)
    sub_id = submission.get("id", "")
    result_url = f"https://pipelinescore.ai/result.html?id={sub_id}" if sub_id and not sub_id.startswith("local") else "https://pipelinescore.ai"
    rank = submission.get("rank")
    tier_name, tier_emoji, tier_tagline, tier_style = get_tier(pipeline_score)

    # Build the result card
    card_lines = []
    card_lines.append(_Align.center(_Text(f"{tier_emoji}  {tier_name}  {tier_emoji}", style=tier_style + " bold")))
    card_lines.append(_Align.center(_Text("")))
    card_lines.append(_Align.center(_Text(f"Pipeline Score", style="dim")))
    card_lines.append(_Align.center(_Text(f"{pipeline_score} / 100", style=f"{tier_style} bold", overflow="fold")))
    if rank:
        card_lines.append(_Align.center(_Text(f"Rank #{rank} on the leaderboard", style="dim")))
    card_lines.append(_Align.center(_Text("")))
    card_lines.append(_Align.center(_Text(f'"{tier_tagline}"', style="italic dim")))
    card_lines.append(_Align.center(_Text("")))
    card_lines.append(_Align.center(_Text(f"📊 {result_url}", style="cyan")))

    from rich.console import Group as _Group
    border = "red" if pipeline_score >= 70 else "yellow" if pipeline_score >= 50 else "dim"
    console.print()
    console.print(_Panel(
        _Group(*card_lines),
        border_style=border,
        padding=(1, 4),
        expand=False,
    ))
    console.print()

    # Log every run to run history
    from datetime import datetime
    history_path = Path("results/run-history.json")
    history_path.parent.mkdir(exist_ok=True)
    history = []
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text())
        except Exception:
            history = []
    
    history.append({
        "run": len(history) + 1,
        "timestamp": datetime.now().isoformat(),
        "team": bundle.get("team", {}).get("name", "unknown"),
        "scores": scores,
        "pipeline_score": pipeline_score,
        "submission_status": submission.get("status", "submitted"),
        "submission_id": submission.get("id"),
        "total_tasks": len(scores)
    })
    history_path.write_text(json.dumps(history, indent=2))
    console.print(f"[dim]Run #{len(history)} logged to {history_path}[/dim]")


if __name__ == "__main__":
    main()
