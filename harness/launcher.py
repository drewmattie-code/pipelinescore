#!/usr/bin/env python3
"""
Pipeline Score — Launcher
Auto-registers, runs the benchmark, opens results in browser.
Exactly like UserBenchmark, but for AI agent teams.
"""
import os
import sys
import json
import time
import platform
import webbrowser
import requests
import hashlib
import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich import print as rprint
except ImportError:
    print("Installing dependencies...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "rich", "requests", "pyyaml", "click", "--quiet"])
    from rich.console import Console
    from rich.panel import Panel

console = Console()

VERSION = "2.0.0"
API_BASE = "https://pipelinescore.ai"
KEY_FILE = Path.home() / ".pipelinescore_key"
CONFIG_FILE = Path.home() / ".pipelinescore_config"

def register(nickname: str, email: str) -> str:
    """Register via secure API — no CF credentials in binary."""
    resp = requests.post(
        "https://pipelinescore.ai/api/register",
        json={"nickname": nickname, "email": email},
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    if resp.ok:
        data = resp.json()
        return data.get("api_key", "")
    return ""


def load_or_create_key() -> tuple[str, str, str]:
    """Return (api_key, team_name, email) — prompting if first run."""
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text())
        return cfg["api_key"], cfg["team_name"], cfg["email"]

    console.print()
    console.print(Panel.fit(
        "[bold cyan]First run![/bold cyan]\n\nEnter a team name and email to get your API key.\nYour results will be posted to [link=https://pipelinescore.ai]pipelinescore.ai[/link].",
        border_style="cyan"
    ))
    console.print()

    team_name = console.input("[bold]Team name[/bold] [dim](e.g. 'My Llama Stack')[/dim]: ").strip()
    email = console.input("[bold]Email[/bold] [dim](for your results page)[/dim]: ").strip()

    if not team_name or not email or "@" not in email:
        console.print("[red]Invalid input. Exiting.[/red]")
        sys.exit(1)

    console.print("\n[dim]Registering...[/dim]")
    try:
        api_key = register(team_name, email)
        CONFIG_FILE.write_text(json.dumps({"api_key": api_key, "team_name": team_name, "email": email}))
        console.print(f"[green]✓[/green] Registered! Key: [dim]{api_key}[/dim]")
        return api_key, team_name, email
    except Exception as e:
        console.print(f"[yellow]⚠ Could not register ({e}). Will save locally.[/yellow]")
        api_key = f"ps_offline_{int(time.time())}"
        CONFIG_FILE.write_text(json.dumps({"api_key": api_key, "team_name": team_name, "email": email}))
        return api_key, team_name, email


def detect_hardware() -> dict:
    hw = {
        "os": platform.system() + " " + platform.release(),
        "arch": platform.machine(),
        "cpu": platform.processor() or platform.machine(),
        "python_version": platform.python_version(),
    }
    try:
        import psutil
        hw["ram_gb"] = round(psutil.virtual_memory().total / 1e9, 1)
    except ImportError:
        hw["ram_gb"] = None
    return hw


def build_default_config(team_name: str, email: str, api_key: str) -> Path:
    """Create a minimal team.yaml if none exists."""
    config_path = Path.home() / ".pipelinescore_team.yaml"
    if config_path.exists():
        return config_path

    console.print()
    console.print("[bold]Quick setup[/bold] — [dim]Which AI provider do you have set up?[/dim]")
    console.print("  [cyan]1[/cyan] Anthropic (Claude)")
    console.print("  [cyan]2[/cyan] OpenAI (GPT)")
    console.print("  [cyan]3[/cyan] Ollama (local models)")
    console.print("  [cyan]4[/cyan] I have a team.yaml already")
    choice = console.input("\n[dim]Choice (1-4):[/dim] ").strip()

    if choice == "4":
        path = console.input("Path to team.yaml: ").strip()
        return Path(path)

    provider_map = {"1": ("anthropic", "ANTHROPIC_API_KEY", "claude-haiku-3-5"), "2": ("openai", "OPENAI_API_KEY", "gpt-4o-mini"), "3": ("ollama", None, "llama3:8b")}
    provider, key_env, default_model = provider_map.get(choice, ("anthropic", "ANTHROPIC_API_KEY", "claude-haiku-3-5"))

    if provider != "ollama":
        model = console.input(f"[dim]Model name[/dim] [dim](default: {default_model}):[/dim] ").strip() or default_model
        endpoint = ""
    else:
        model = console.input(f"[dim]Model name[/dim] [dim](default: {default_model}):[/dim] ").strip() or default_model
        endpoint = console.input("[dim]Ollama endpoint[/dim] [dim](default: http://localhost:11434):[/dim] ").strip() or "http://localhost:11434"

    roles = ["orchestrator", "researcher", "analyst", "builder", "communicator"]
    agents_yaml = ""
    for role in roles:
        agents_yaml += f"""  - name: {role.capitalize()[:1] + role[1:]}
    role: {role}
    provider: {provider}
    model: {model}
"""
        if key_env:
            agents_yaml += f"    api_key_env: {key_env}\n"
        if endpoint:
            agents_yaml += f"    endpoint: {endpoint}\n"

    yaml_content = f"""team:
  name: "{team_name}"
  owner_email: "{email}"

pipelinescore:
  api_key_env: PIPELINESCORE_API_KEY

judge:
  name: Judge
  provider: anthropic
  model: claude-haiku-3-5
  api_key_env: ANTHROPIC_API_KEY

agents:
{agents_yaml}
"""
    config_path.write_text(yaml_content)
    console.print(f"[green]✓[/green] Config saved to {config_path}")
    return config_path


def submit_result(bundle: dict, api_key: str) -> dict:
    """Submit via secure API endpoint — no CF credentials in binary."""
    resp = requests.post(
        "https://pipelinescore.ai/api/submit",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=bundle,
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def main():
    console.print(f"\n[bold white]Pipeline Score[/bold white] [dim]v{VERSION}[/dim]")
    console.print("[dim]The AI agent team benchmark[/dim]\n")

    # Step 1: Get or create identity
    api_key, team_name, email = load_or_create_key()
    os.environ["PIPELINESCORE_API_KEY"] = api_key

    # Step 2: Get or build team config
    local_yaml = Path("team.yaml")
    if local_yaml.exists():
        config_path = local_yaml
        console.print(f"[green]✓[/green] Using [dim]team.yaml[/dim] in current directory")
    else:
        config_path = build_default_config(team_name, email, api_key)

    # Step 3: Run harness
    console.print()
    harness_path = Path(__file__).parent / "harness.py"
    if not harness_path.exists():
        # If bundled as exe, harness.py is in same dir as executable
        harness_path = Path(sys.executable).parent / "harness.py"

    env = os.environ.copy()
    env["PIPELINESCORE_API_KEY"] = api_key

    result = subprocess.run(
        [sys.executable, str(harness_path), "-c", str(config_path)],
        env=env
    )

    # Step 4: Auto-open results
    if result.returncode == 0:
        console.print()
        # Find the latest submission file
        results_dir = Path("results")
        submissions = sorted(results_dir.glob("submission-*.json")) if results_dir.exists() else []
        if submissions:
            bundle = json.loads(submissions[-1].read_text())
            try:
                sub = submit_result(bundle, api_key)
                result_url = sub.get("result_url", f"https://pipelinescore.ai/result.html?id={sub.get('submission_id','')}")
                console.print(f"\n[bold green]🎉 Your results are live![/bold green]")
                console.print(f"[cyan]Pipeline Score:[/cyan] [bold]{sub['pipeline_score']}/100[/bold]  [dim]Rank #{sub['rank']}[/dim]")
                console.print(f"\n[bold]📊 {result_url}[/bold]\n")
                time.sleep(1)
                webbrowser.open(result_url)
            except Exception as e:
                console.print(f"[yellow]Results saved locally. Submit manually: pipelinescore.ai/submit.html[/yellow]")


if __name__ == "__main__":
    main()
