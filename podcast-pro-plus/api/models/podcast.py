from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional, Literal, Union
from datetime import datetime
from uuid import UUID, uuid4
import json
from enum import Enum

from .user import User

class MediaCategory(str, Enum):
    intro = "intro"
    outro = "outro"
    music = "music"
    commercial = "commercial"
    sfx = "sfx"
    main_content = "main_content"
    podcast_cover = "podcast_cover"
    episode_cover = "episode_cover"

class EpisodeStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    processed = "processed"
    published = "published"
    error = "error"

from enum import Enum

class PodcastType(str, Enum):
    episodic = "episodic"
    serial = "serial"

class PodcastBase(SQLModel):
    name: str
    description: Optional[str] = None
    # Legacy cover_path (may hold local filename or remote URL). Prefer remote_cover_url going forward.
    cover_path: Optional[str] = None
    # Deprecated: rss_url & rss_url_locked are derivable from spreaker_show_id; retained for backward compat until migration.
    rss_url: Optional[str] = Field(default=None, index=True)
    rss_url_locked: Optional[str] = Field(default=None, description="Canonical RSS feed URL from Spreaker (immutable once set – deprecated; compute instead)")
    # New: authoritative Spreaker-hosted cover image URL (set after upload or show fetch)
    remote_cover_url: Optional[str] = Field(default=None, description="Spreaker-hosted show cover URL (preferred reference)")
    podcast_type: Optional[PodcastType] = Field(default=None)
    language: Optional[str] = None
    copyright_line: Optional[str] = None
    owner_name: Optional[str] = None
    author_name: Optional[str] = None
    spreaker_show_id: Optional[str] = None
    contact_email: Optional[str] = None
    category_id: Optional[int] = Field(default=None, description="Primary Spreaker category id")
    category_2_id: Optional[int] = Field(default=None, description="Secondary Spreaker category id")
    category_3_id: Optional[int] = Field(default=None, description="Tertiary Spreaker category id")

class Podcast(PodcastBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="user.id")
    user: Optional[User] = Relationship()
    
    episodes: List["Episode"] = Relationship(back_populates="podcast", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

    @property
    def rss_feed_url(self) -> Optional[str]:
        """Deterministic RSS feed URL derived from spreaker_show_id.
        Prefer this over stored rss_url / rss_url_locked which will be removed."""
        sid = getattr(self, 'spreaker_show_id', None)
        if not sid:
            return None
        return f"https://www.spreaker.com/show/{sid}/episodes/feed"

    @property
    def preferred_cover_url(self) -> Optional[str]:
        """Preferred cover image URL for this podcast (remote if available, else legacy cover_path)."""
        return getattr(self, 'remote_cover_url', None) or getattr(self, 'cover_path', None)

class StaticSegmentSource(SQLModel):
    source_type: Literal["static"] = "static"
    filename: str

class AIGeneratedSegmentSource(SQLModel):
    source_type: Literal["ai_generated"] = "ai_generated"
    prompt: str
    voice_id: str = "19B4gjtpL5m876wS3Dfg"

class TTSSegmentSource(SQLModel):
    source_type: Literal["tts"] = "tts"
    # For per-episode prompts, we only store a short label/placeholder in the template.
    # Keep legacy "script" for backward compatibility (old templates may have inline script).
    script: str = ""
    # Optional human-friendly label shown during episode creation (preferred going forward).
    text_prompt: Optional[str] = None
    # Default voice for this segment (optional)
    voice_id: str = "19B4gjtpL5m876wS3Dfg"

class TemplateSegment(SQLModel):
    id: UUID = Field(default_factory=uuid4)
    segment_type: Literal["intro", "outro", "commercial", "sound_effect", "transition", "content"]
    source: Union[StaticSegmentSource, AIGeneratedSegmentSource, TTSSegmentSource]

class BackgroundMusicRule(SQLModel):
    id: UUID = Field(default_factory=uuid4)
    music_filename: str
    apply_to_segments: List[Literal["intro", "content", "outro"]]
    start_offset_s: float = 0.0
    end_offset_s: float = 0.0
    fade_in_s: float = 2.0
    fade_out_s: float = 3.0
    volume_db: int = -15

class SegmentTiming(SQLModel):
    # Defaults are zero (no overlap). Users can specify negative values to overlap.
    content_start_offset_s: float = 0.0
    outro_start_offset_s: float = 0.0

class PodcastTemplateCreate(SQLModel):
    name: str
    segments: List[TemplateSegment]
    background_music_rules: List[BackgroundMusicRule] = []
    timing: SegmentTiming = Field(default_factory=SegmentTiming)
    podcast_id: Optional[UUID] = None  # Associate template with a specific podcast/show
    # Optional: default ElevenLabs voice to seed per-episode TTS segments
    default_elevenlabs_voice_id: Optional[str] = None
    # AI settings for auto-suggestions in UI
    class AITemplateSettings(SQLModel):
        auto_fill_ai: bool = True
        title_instructions: Optional[str] = None
        notes_instructions: Optional[str] = None
        tags_instructions: Optional[str] = None
        tags_always_include: List[str] = []
    # Allow templates to opt out of automatic tag generation (persisted in ai_settings_json)
    auto_generate_tags: bool = True

    ai_settings: AITemplateSettings = Field(default_factory=AITemplateSettings)
    # New: allow disabling a template without deleting it
    is_active: bool = True

class PodcastTemplate(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str
    user_id: UUID = Field(foreign_key="user.id")
    user: Optional[User] = Relationship(back_populates="templates")
    podcast_id: Optional[UUID] = Field(default=None, foreign_key="podcast.id")
    segments_json: str = Field(default="[]")
    background_music_rules_json: str = Field(default="[]")
    timing_json: str = Field(default_factory=lambda: SegmentTiming().model_dump_json())
    # New: JSON blob to hold AI settings
    ai_settings_json: str = Field(default_factory=lambda: PodcastTemplateCreate.AITemplateSettings().model_dump_json())
    # New: Active status toggle
    is_active: bool = Field(default=True)
    # New: default voice id for per-episode TTS segments
    default_elevenlabs_voice_id: Optional[str] = Field(default=None)

    episodes: List["Episode"] = Relationship(back_populates="template")

class PodcastTemplatePublic(PodcastTemplateCreate):
    id: UUID
    user_id: UUID
    podcast_id: Optional[UUID] = None

class MediaItem(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    friendly_name: Optional[str] = Field(default=None)
    category: MediaCategory = Field(default=MediaCategory.music)
    filename: str
    content_type: Optional[str] = None
    filesize: Optional[int] = None
    # Optional spoken trigger keyword (used for SFX insertion during cleanup if spoken in content)
    trigger_keyword: Optional[str] = Field(default=None, index=False, description="Spoken keyword that triggers this media as SFX")
    user_id: UUID = Field(foreign_key="user.id")
    user: Optional[User] = Relationship()
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # When to expire this raw upload (UTC). For main_content, defaults to the first 2am PT boundary after upload + 14 days.
    expires_at: Optional[datetime] = Field(default=None, description="UTC timestamp when this media item should be purged if unused")

class MusicAssetSource(str, Enum):
    builtin = "builtin"  # bundled curated loop
    external = "external"  # downloaded from external provider / catalog
    ai = "ai"  # future AI generated asset

class MusicAsset(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    display_name: str
    filename: str
    duration_s: Optional[float] = None
    mood_tags_json: str = Field(default="[]")  # JSON list of strings
    source_type: MusicAssetSource = Field(default=MusicAssetSource.builtin)
    license: Optional[str] = None
    attribution: Optional[str] = None
    user_select_count: int = Field(default=0, description="How many times users picked this asset")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def mood_tags(self) -> List[str]:
        try:
            return json.loads(self.mood_tags_json)
        except Exception:
            return []

class Episode(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    
    user_id: UUID = Field(foreign_key="user.id")
    user: Optional[User] = Relationship()
    template_id: Optional[UUID] = Field(default=None, foreign_key="podcasttemplate.id")
    template: Optional[PodcastTemplate] = Relationship(back_populates="episodes")
    podcast_id: UUID = Field(foreign_key="podcast.id")
    podcast: Optional[Podcast] = Relationship(back_populates="episodes")

    title: str = Field(default="Untitled Episode")
    cover_path: Optional[str] = Field(default=None)
    show_notes: Optional[str] = Field(default=None)
    season_number: Optional[int] = Field(default=None, description="Season number for ordering/auto-increment")
    episode_number: Optional[int] = Field(default=None, description="Episode number within the season")
    # Extended editable metadata (locally stored; some not yet propagated to Spreaker API)
    # episode_type & chapters intentionally omitted until Spreaker exposes API support
    tags_json: Optional[str] = Field(default="[]", description="JSON list of tag strings (AI generated soon)")
    is_explicit: bool = Field(default=False, description="Explicit content flag (local; mirror to Spreaker when API exposed)")
    image_crop: Optional[str] = Field(default=None, description="Crop rectangle 'x1,y1,x2,y2' for square extraction when pushing to Spreaker")
    
    status: EpisodeStatus = Field(default=EpisodeStatus.pending)
    final_audio_path: Optional[str] = Field(default=None)
    spreaker_episode_id: Optional[str] = Field(default=None)
    is_published_to_spreaker: bool = Field(default=False)
    remote_cover_url: Optional[str] = Field(default=None, description="Spreaker-hosted cover image URL after publish")
    # Publish failure diagnostics
    spreaker_publish_error: Optional[str] = Field(default=None, description="Short error label from last Spreaker publish attempt")
    spreaker_publish_error_detail: Optional[str] = Field(default=None, description="Detailed error payload / message from last attempt")
    needs_republish: bool = Field(default=False, description="Set true when assembly succeeded but publish failed; UI can offer retry without reassembly")
    # Audio pipeline metadata & working filename for in-progress/cleaned content
    meta_json: Optional[str] = Field(default="{}", description="Arbitrary JSON metadata for processing (flubber contexts, cuts, etc.)")
    working_audio_name: Optional[str] = Field(default=None, description="Current working audio basename (e.g., cleaned content) used as source for final mixing")

    processed_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp (added via migration)")
    publish_at: Optional[datetime] = Field(default=None)
    # Raw local-time string as originally entered by the user (no timezone math),
    # so UI can display exactly what they chose even though publish_at is stored UTC.
    publish_at_local: Optional[str] = Field(default=None)
    # Compatibility: legacy .description maps to .show_notes
    @property
    def description(self):
        return getattr(self, 'show_notes', None)

    def tags(self) -> List[str]:  # convenience helper
        try:
            return json.loads(self.tags_json or "[]")
        except Exception:
            return []

    def set_tags(self, tags: List[str]):
        try:
            self.tags_json = json.dumps([t for t in tags if t])
        except Exception:
            self.tags_json = json.dumps([])


class SectionType(str, Enum):
        intro = "intro"
        outro = "outro"
        custom = "custom"


class EpisodeSection(SQLModel, table=True):
        """A short, tagged section script/prompt used for intros/outros/etc.

        Notes:
        - tag: logical name/category (e.g., "Interview Intro", "Short Outro").
            We cap distinct tags per podcast via router logic.
        - section_type: intro/outro/custom for filtering/history.
        - content: the script text (for TTS) or prompt text (for AI-generated).
        - episode_id is optional to allow saving drafts before episode creation.
        - voice metadata persists the chosen TTS voice for future reuse.
        """
        id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
        user_id: UUID = Field(foreign_key="user.id")
        user: Optional[User] = Relationship()
        podcast_id: UUID = Field(foreign_key="podcast.id")
        podcast: Optional[Podcast] = Relationship()
        episode_id: Optional[UUID] = Field(default=None, foreign_key="episode.id")
        episode: Optional[Episode] = Relationship()

        tag: str = Field(index=True)
        section_type: SectionType = Field(default=SectionType.intro)
        
        class SectionSourceType(str, Enum):
            tts = "tts"
            ai_generated = "ai_generated"
            static = "static"

        source_type: "EpisodeSection.SectionSourceType" = Field(default=SectionSourceType.tts)
        content: str = Field(default="")
        voice_id: Optional[str] = Field(default=None)
        voice_name: Optional[str] = Field(default=None)
        created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

