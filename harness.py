#!/usr/bin/env python3
"""
Pipeline Score Auto-Scoring Harness

A skeleton harness for validating submissions and scoring agent pipeline
performance on benchmark tasks.

Usage:
    python harness.py --submission submission_example.json --task-id test_001
"""

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


# =============================================================================
# Data Models
# =============================================================================

@dataclass
class Agent:
    id: str
    role: str
    model: str
    model_version: str
    quantization: str | None
    constitution_hash: str


@dataclass
class Hardware:
    tier: str
    specs: str
    cost_per_hour: float


@dataclass
class Orchestration:
    entry_point: str
    routes: dict[str, list[str]]


@dataclass
class Tool:
    id: str
    category: str
    description: str


@dataclass
class CostProfile:
    estimated_cost_per_task_usd: float
    cost_breakdown: dict[str, float] | None = None


@dataclass
class Team:
    id: str
    name: str
    contact_email: str


@dataclass
class Metadata:
    submitted_at: str
    benchmark_version: str
    notes: str | None = None


@dataclass
class Submission:
    team: Team
    agents: list[Agent]
    hardware: Hardware
    orchestration: Orchestration
    tools: list[Tool]
    cost_profile: CostProfile
    metadata: Metadata


@dataclass
class TaskResult:
    task_id: str
    submission_id: str
    speed_score: float
    cost_score: float
    quality_score: float
    composite_score: float
    run_metadata: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# Model Pricing (stub data - replace with actual pricing)
# =============================================================================

MODEL_PRICING: dict[str, float] = {
    "qwen3.5": 0.001,  # $ per 1K input tokens
    "gpt-4o": 0.01,
    "gpt-4o-mini": 0.001,
    "claude-3-5-sonnet": 0.015,
    "claude-3-5-haiku": 0.001,
}


# =============================================================================
# Schema Validation
# =============================================================================

def validate_submission(data: dict[str, Any]) -> list[str]:
    """
    Validate submission against schema.
    Returns list of validation errors (empty if valid).
    """
    errors: list[str] = []
    
    # Required top-level fields
    required_fields = ["team", "agents", "hardware", "orchestration", "tools", "cost_profile", "metadata"]
    for field in required_fields:
        if field not in data:
            errors.append(f"Missing required field: {field}")
    
    if "team" in data:
        team_fields = ["id", "name", "contact_email"]
        for f in team_fields:
            if f not in data["team"]:
                errors.append(f"Missing team field: {f}")
    
    if "agents" in data:
        if not isinstance(data["agents"], list) or len(data["agents"]) == 0:
            errors.append("agents must be a non-empty list")
        else:
            for i, agent in enumerate(data["agents"]):
                agent_required = ["id", "role", "model", "model_version", "constitution_hash"]
                for f in agent_required:
                    if f not in agent:
                        errors.append(f"agents[{i}]: missing field '{f}'")
    
    if "hardware" in data:
        hw_required = ["tier", "specs", "cost_per_hour"]
        for f in hw_required:
            if f not in data["hardware"]:
                errors.append(f"hardware: missing field '{f}'")
        valid_tiers = ["cloud_api", "consumer_gpu", "prosumer_apple_silicon", "enterprise_gpu"]
        if "tier" in data["hardware"] and data["hardware"]["tier"] not in valid_tiers:
            errors.append(f"hardware.tier must be one of: {valid_tiers}")
    
    if "orchestration" in data:
        if "entry_point" not in data["orchestration"]:
            errors.append("orchestration: missing entry_point")
        if "routes" not in data["orchestration"]:
            errors.append("orchestration: missing routes")
    
    if "cost_profile" in data:
        if "estimated_cost_per_task_usd" not in data["cost_profile"]:
            errors.append("cost_profile: missing estimated_cost_per_task_usd")
    
    return errors


def load_submission(path: str) -> Submission:
    """Load and parse a submission JSON file."""
    with open(path, "r") as f:
        data = json.load(f)
    
    errors = validate_submission(data)
    if errors:
        raise ValueError(f"Invalid submission: {errors}")
    
    # Parse into dataclasses
    team = Team(**data["team"])
    agents = [Agent(**a) for a in data["agents"]]
    hardware = Hardware(**data["hardware"])
    orchestration = Orchestration(**data["orchestration"])
    tools = [Tool(**t) for t in data["tools"]]
    cost_profile = CostProfile(**data["cost_profile"])
    metadata = Metadata(**data["metadata"])
    
    return Submission(
        team=team,
        agents=agents,
        hardware=hardware,
        orchestration=orchestration,
        tools=tools,
        cost_profile=cost_profile,
        metadata=metadata,
    )


# =============================================================================
# Task Execution (Stub)
# =============================================================================

def run_task_stub(task_id: str, input_data: dict[str, Any], submission: Submission) -> dict[str, Any]:
    """
    Stub task executor. Replace with actual benchmark task execution.
    
    Returns a dict with:
        - output: the task output
        - time_seconds: execution time
        - tokens_used: total tokens consumed
    """
    start_time = time.perf_counter()
    
    # Simulate task execution
    # In a real implementation, this would run the agent pipeline
    time.sleep(0.1)  # Simulate minimal work
    
    elapsed = time.perf_counter() - start_time
    
    # Stub output
    return {
        "output": {"result": "stub_output", "task_id": task_id},
        "time_seconds": elapsed,
        "tokens_used": 1500,  # Stub: 1.5K tokens
    }


# =============================================================================
# Scoring Logic
# =============================================================================

def compute_speed_score(time_seconds: float, baseline_time: float = 10.0) -> float:
    """
    Score speed as normalized inverse of time.
    Score = 1.0 when time = 0, approaches 0 as time increases.
    """
    if time_seconds <= 0:
        return 1.0
    # Normalize: faster than baseline = higher score
    score = max(0.0, 1.0 - (time_seconds / baseline_time))
    return score


def compute_cost_score(tokens_used: int, model: str, baseline_cost: float = 1.0) -> float:
    """
    Score cost efficiency based on tokens used and model pricing.
    """
    price_per_1k = MODEL_PRICING.get(model, 0.001)
    actual_cost = (tokens_used / 1000.0) * price_per_1k
    
    if actual_cost <= 0:
        return 1.0
    # Lower cost = higher score
    score = max(0.0, 1.0 - (actual_cost / baseline_cost))
    return score


def compute_quality_score(output: dict[str, Any], quality_fn: Callable[[dict], float] | None = None) -> float:
    """
    Compute quality score from task output.
    
    Args:
        output: Task output dictionary
        quality_fn: Optional custom quality function. If None, uses stub.
    
    Returns:
        Quality score between 0.0 and 1.0
    """
    if quality_fn is not None:
        return quality_fn(output)
    
    # Stub quality scorer - replace with actual implementation
    # This should be customized per benchmark task
    return 0.85  # Default stub score


def geometric_mean(values: list[float]) -> float:
    """Compute geometric mean of a list of positive values."""
    if not values:
        return 0.0
    product = 1.0
    for v in values:
        if v <= 0:
            return 0.0
        product *= v
    return product ** (1.0 / len(values))


def compute_composite_score(speed: float, cost: float, quality: float) -> float:
    """
    Compute composite score using geometric mean of normalized dimensions.
    """
    return geometric_mean([speed, cost, quality])


# =============================================================================
# Main Harness
# =============================================================================

def run_harness(
    submission_path: str,
    task_id: str,
    task_input: dict[str, Any] | None = None,
    quality_fn: Callable[[dict], float] | None = None,
) -> TaskResult:
    """
    Run the scoring harness on a submission.
    
    Args:
        submission_path: Path to submission JSON
        task_id: Identifier for the task being scored
        task_input: Input data for the task (optional)
        quality_fn: Custom quality scoring function (optional)
    
    Returns:
        TaskResult with all scores and metadata
    """
    # Load and validate submission
    print(f"Loading submission from: {submission_path}")
    submission = load_submission(submission_path)
    print(f"✓ Validated submission: {submission.team.name}")
    
    # Get primary model for pricing
    primary_model = submission.agents[0].model if submission.agents else "qwen3.5"
    
    # Run task
    if task_input is None:
        task_input = {"task_id": task_id, "stub": True}
    
    print(f"Running task: {task_id}")
    result = run_task_stub(task_id, task_input, submission)
    
    time_seconds = result["time_seconds"]
    tokens_used = result["tokens_used"]
    
    # Compute scores
    speed_score = compute_speed_score(time_seconds)
    cost_score = compute_cost_score(tokens_used, primary_model)
    quality_score = compute_quality_score(result["output"], quality_fn)
    
    # Composite score
    composite = compute_composite_score(speed_score, cost_score, quality_score)
    
    # Build result
    task_result = TaskResult(
        task_id=task_id,
        submission_id=submission.team.id,
        speed_score=round(speed_score, 4),
        cost_score=round(cost_score, 4),
        quality_score=round(quality_score, 4),
        composite_score=round(composite, 4),
        run_metadata={
            "time_seconds": round(time_seconds, 4),
            "tokens_used": tokens_used,
            "model": primary_model,
            "hardware_tier": submission.hardware.tier,
            "agent_count": len(submission.agents),
        },
    )
    
    return task_result


def main():
    parser = argparse.ArgumentParser(description="Pipeline Score Auto-Scoring Harness")
    parser.add_argument(
        "--submission", "-s",
        required=True,
        help="Path to submission JSON file",
    )
    parser.add_argument(
        "--task-id", "-t",
        required=True,
        help="Task identifier",
    )
    parser.add_argument(
        "--input", "-i",
        default=None,
        help="Task input JSON file (optional)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output JSON file (optional, prints to stdout if not specified)",
    )
    
    args = parser.parse_args()
    
    # Load task input if provided
    task_input = None
    if args.input:
        with open(args.input, "r") as f:
            task_input = json.load(f)
    
    # Run harness
    result = run_harness(args.submission, args.task_id, task_input)
    
    # Output result
    output_data = {
        "task_id": result.task_id,
        "submission_id": result.submission_id,
        "speed_score": result.speed_score,
        "cost_score": result.cost_score,
        "quality_score": result.quality_score,
        "composite_score": result.composite_score,
        "run_metadata": result.run_metadata,
    }
    
    output_json = json.dumps(output_data, indent=2)
    
    if args.output:
        with open(args.output, "w") as f:
            f.write(output_json)
        print(f"Results written to: {args.output}")
    else:
        print(output_json)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
