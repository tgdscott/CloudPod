from __future__ import annotations

from typing import List, Optional, Union
from uuid import UUID
from pydantic import BaseModel


IdT = Union[UUID, int]


class SuggestTitleIn(BaseModel):
    episode_id: IdT
    podcast_id: IdT
    transcript_path: Optional[str] = None
    hint: Optional[str] = None
    base_prompt: Optional[str] = None
    extra_instructions: Optional[str] = None
    history_count: int = 10


class SuggestNotesIn(BaseModel):
    episode_id: IdT
    podcast_id: IdT
    transcript_path: Optional[str] = None
    hint: Optional[str] = None
    base_prompt: Optional[str] = None
    extra_instructions: Optional[str] = None
    history_count: int = 10


class SuggestTagsIn(BaseModel):
    episode_id: IdT
    podcast_id: IdT
    transcript_path: Optional[str] = None
    hint: Optional[str] = None
    base_prompt: Optional[str] = None
    extra_instructions: Optional[str] = None
    history_count: int = 10
    tags_always_include: List[str] = []


class SuggestTitleOut(BaseModel):
    title: str


class SuggestNotesOut(BaseModel):
    description: str
    bullets: List[str] = []


class SuggestTagsOut(BaseModel):
    tags: List[str]


class SuggestSectionIn(BaseModel):
    episode_id: IdT
    podcast_id: IdT
    tag: str
    section_type: str  # "intro" | "outro" | "custom"
    transcript_path: Optional[str] = None
    hint: Optional[str] = None
    base_prompt: Optional[str] = None
    extra_instructions: Optional[str] = None
    history_count: int = 10


class SuggestSectionOut(BaseModel):
    script: str
