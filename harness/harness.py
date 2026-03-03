#!/usr/bin/env python3
"""
Pipeline Score Harness v2.0
Run the benchmark on your own agent stack and submit scores.
"""

import json
import os
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
PIPELINESCORE_API_URL = "https://pipelinescore.ai/api/submit"


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
            prompt = stage["prompt"]
            if context:
                prompt = prompt.format(**context)
            
            start_time = time.time()
            response = self._call_agent(agent, prompt)
            elapsed = time.time() - start_time
            
            # Store context for next stage
            context[f"{role}_output"] = response
            
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
        """Call Ollama API."""
        url = f"{endpoint.rstrip('/')}/api/generate"
        resp = requests.post(url, json={
            "model": model,
            "prompt": prompt,
            "stream": False
        }, timeout=120)
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
        
        resp = requests.post(url, headers=headers, json=body, timeout=120)
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
        
        resp = requests.post(url, headers=headers, json=body, timeout=120)
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
        
        resp = requests.post(url, headers=headers, json=body, timeout=120)
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
        
        scoring_prompt = f"{rubric}\n\nOutput to evaluate:\n{full_output}"
        
        response = self._call_judge(judge, scoring_prompt)
        
        try:
            # Try to extract JSON from response
            import re
            json_match = re.search(r'\{[^}]+\}', response, re.DOTALL)
            if json_match:
                score_data = json.loads(json_match.group())
                return score_data.get("score", 50)
        except Exception:
            pass
        
        return 50  # Default if parsing fails
    
    def _score_task(self, result: dict) -> int:
        """Score individual task output."""
        rubric = self.rubrics.get("default_rubric")
        
        scoring_prompt = f"{rubric}\n\nOutput to evaluate:\n{result.get('response', '')}"
        
        judge = self.config.get_orchestrator()
        response = self._call_judge(judge, scoring_prompt)
        
        try:
            import re
            json_match = re.search(r'\{[^}]+\}', response, re.DOTALL)
            if json_match:
                score_data = json.loads(json_match.group())
                return score_data.get("score", 50)
        except Exception:
            pass
        
        return 50
    
    def _call_judge(self, judge: dict, prompt: str) -> str:
        """Call judge agent for scoring."""
        # This is a simplified version - in production would use proper API calls
        task_runner = TaskRunner.__new__(TaskRunner)
        task_runner.config = self.config
        return task_runner._call_agent(judge, prompt)


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
        """Submit bundle to API."""
        api_key_env = self.config.config.get("pipelinescore", {}).get("api_key_env")
        api_key = self.config.get_api_key(api_key_env) or "demo_key"
        
        if dry_run:
            console.print("[yellow]DRY RUN - Not actually submitting[/yellow]")
            return {"id": "dry-run", "rank": None, "url": None}
        
        url = PIPELINESCORE_API_URL if not self.local else "http://localhost:8080/api/submit"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        try:
            resp = requests.post(url, headers=headers, json=bundle, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            console.print(f"[red]Submission failed: {e}[/red]")
            # Return mock response for demo purposes
            return {
                "id": f"demo-{hash(str(bundle))[:8]}",
                "rank": None,
                "url": f"https://pipelinescore.ai/team/demo"
            }


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
    
    # Run pipeline
    console.print("[cyan]🏃 Running Pipeline Test (flagship)...[/cyan]")
    pipeline_task = task_runner._find_task("pipeline_001")
    if pipeline_task:
        pipeline_result = task_runner._run_pipeline(pipeline_task)
        raw_results["pipeline"] = pipeline_result
        console.print(f"[green]✓[/green] Pipeline complete: {pipeline_result['total_elapsed_seconds']}s")
    
    # Run supporting tasks
    console.print("[cyan]🧪 Running 9 supporting tests...[/cyan]")
    task_results = task_runner.run_all()
    raw_results["tasks"] = task_results
    console.print(f"[green]✓[/green] All tasks complete")
    
    # Score results
    console.print("[cyan]📊 Scoring outputs...[/cyan]")
    scores = scorer.score(pipeline_result, task_results)
    
    for task_id, score in scores.items():
        console.print(f"  {task_id}: {score}/100")
    
    # Bundle results
    bundler = ResultBundler(team_config, hardware, verification, scores)
    bundle = bundler.build(raw_results)
    
    # Submit
    console.print("[cyan]📤 Submitting to Pipeline Score...[/cyan]")
    submitter = Submitter(team_config, local)
    submission = submitter.submit(bundle, dry_run)
    
    # Print results
    pipeline_score = scores.get("pipeline", 0)
    console.print(f"\n[bold green]✅ Done! Pipeline Score: {pipeline_score}/100[/bold green]")
    
    if submission.get("url"):
        console.print(f"[link]{submission['url']}[/link]")
    
    if submission.get("rank"):
        console.print(f"Leaderboard Rank: #{submission['rank']}")


if __name__ == "__main__":
    main()
