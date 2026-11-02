"""Validated request contracts shared by the HTTP route modules."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Workspace(Strict):
    labeling_model_id: str | None = None
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    task: Literal["attribute_extraction"] = "attribute_extraction"


class Rename(Strict):
    name: str = Field(min_length=1, max_length=100)
    status: Literal["ready", "archived"] = "ready"


class LabelEdit(Strict):
    category: Literal["아우터", "상의", "하의", "ACC"] | None = None
    target: dict[str, str | list[str]]
    unscored_fields: list[str] = Field(default_factory=list, max_length=14)
    human_verified: bool = False
    note: str = Field(default="", max_length=1000)
    split: Literal["unassigned", "train", "validation", "test"] | None = None


class SplitEdit(Strict):
    sample_ids: list[str] = Field(min_length=1, max_length=100000)
    split: Literal["unassigned", "train", "validation", "test"]


class Reconstruction(Strict):
    workspace_id: str | None = None
    name: str = Field(min_length=1, max_length=100)
    dataset_ids: list[str] = Field(min_length=1, max_length=8)
    data_count: int | None = Field(default=None, ge=1, le=100000)
    train_budget: int | None = Field(default=None, ge=1, le=100000)
    reference_id: str | None = None
    dataset_weights: dict[str, float] = Field(default_factory=dict)
    seed: int = Field(default=42, ge=0, le=2147483647)

    method: Literal[
        "balanced_mix", "merge", "source_balanced", "random", "distribution"
    ] = "balanced_mix"


class Job(Strict):
    kind: Literal["training", "evaluation", "drift", "labeling"]
    dataset_id: str
    model_id: str | None = None
    reference_id: str | None = None
    max_steps: int = Field(default=20, ge=1, le=10000)
    learning_rate: float = Field(default=2e-5, gt=0, le=0.01)
    sample_limit: int | None = Field(default=None, ge=1, le=10000)
    split: Literal["validation", "test"] = "validation"
    threshold: float = Field(default=0.1, gt=0, le=1)
    seed: int = Field(default=42, ge=0, le=2147483647)
    sampling: Literal["random", "source_balanced"] = "random"


class Deletion(Strict):
    kind: Literal["workspace", "dataset", "samples"]
    id: str
    sample_ids: list[str] = Field(default_factory=list, max_length=1000)
    token: str = ""
