from __future__ import annotations

import io
import json
import logging
import time
from typing import Any, Dict, Optional

from pydub import AudioSegment

try:  # ElevenLabs SDK is optional
	from elevenlabs.client import ElevenLabs
	from elevenlabs.core import ApiError
except Exception:  # pragma: no cover
	ElevenLabs = None  # type: ignore
	ApiError = Exception  # type: ignore

from ..core.config import settings
from .tts_google import synthesize_google_tts, GoogleTTSNotConfigured

logger = logging.getLogger(__name__)


class AIEnhancerError(Exception):
	"""Custom exception for AI enhancement failures."""
	pass


# --- Gemini helpers (loaded lazily so missing pkg/env doesn't crash import) ---
GEMINI_MODEL = "models/gemini-2.5-flash"


def _require_gemini_model():
	"""Return a configured GenerativeModel; raise AIEnhancerError if unavailable."""
	api_key = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
	if not api_key or api_key.startswith("YOUR_"):
		raise AIEnhancerError("Gemini API key not configured. Set GEMINI_API_KEY in your environment.")
	try:
		import google.generativeai as genai  # type: ignore
	except Exception as e:  # pragma: no cover
		raise AIEnhancerError(f"google-generativeai not installed: {e}")
	try:
		# Use getattr to appease static analyzers that don't know these symbols
		cfg = getattr(genai, "configure", None)
		if callable(cfg):
			cfg(api_key=api_key)
		model_cls = getattr(genai, "GenerativeModel", None)
		if model_cls is None:
			raise RuntimeError("GenerativeModel not available in google.generativeai")
		return model_cls(GEMINI_MODEL)
	except Exception as e:
		raise AIEnhancerError(f"Failed to initialize Gemini model: {e}")


def generate_metadata_from_transcript(transcript: str) -> Dict[str, Any]:
	"""Generate episode metadata (title, summary, keywords) using Gemini."""
	system_prompt = (
		"You are an expert podcast producer. Analyze the transcript and produce a JSON object with: "
		"title (string), summary (string <= 3 sentences), keywords (array of short tags)."
	)
	model = _require_gemini_model()
	try:
		resp = model.generate_content([
			{"role": "user", "parts": [system_prompt + f"\nTranscript:\n\n{transcript}"]}
		])
		text = (getattr(resp, "text", None) or "").strip()
		return json.loads(text) if text else {"title": "", "summary": "", "keywords": []}
	except Exception as e:
		raise AIEnhancerError(f"Failed to generate metadata: {e}")


def interpret_intern_command(command_text: str) -> Dict[str, Any]:
	"""Interpret spoken 'intern' command to decide action and topic via Gemini."""
	system_prompt = (
		"You interpret spoken commands for a podcast AI. Return JSON with keys: action "
		"('add_to_shownotes' or 'generate_audio') and topic (string)."
	)
	model = _require_gemini_model()
	try:
		resp = model.generate_content([
			{"role": "user", "parts": [system_prompt + f"\nCommand: {command_text}"]}
		])
		text = (getattr(resp, "text", None) or "").strip()
		data = json.loads(text) if text else {}
		if not isinstance(data, dict):
			data = {}
		return {
			"action": (data.get("action") or "generate_audio"),
			"topic": (data.get("topic") or command_text or "").strip(),
		}
	except Exception as e:
		raise AIEnhancerError(f"Failed to interpret command: {e}")


def _strip_prompt_echo(answer: str, prompts: list[str] | None = None) -> str:
	"""Best-effort removal of prompt/question echo and duplicated tails."""
	import re

	if not answer:
		return ""
	txt = answer
	# Remove explicit prompt substrings
	for p in (prompts or []):
		if p:
			txt = txt.replace(p, "")
	# Drop lines starting with Question:/Q:/User:
	lines = []
	for ln in txt.splitlines():
		if re.search(r"^(q(uestion)?|user|prompt)\s*[:\-]", ln.strip(), re.IGNORECASE):
			continue
		lines.append(ln)
	txt = "\n".join(lines)
	# Simple duplicate tail trim on sentence boundaries
	parts = [p.strip() for p in re.split(r"(\.|\?|!|\n)", txt) if p is not None]
	if parts:
		seen = set()
		out: list[str] = []
		for p in parts:
			key = p.lower()
			if (out and key == out[-1].lower()) or (key in seen and len(p) <= 10):
				continue
			out.append(p)
			seen.add(key)
		txt = "".join(out)
	return txt.strip()


def get_answer_for_topic(topic: str) -> str:
	"""Get a concise 2–3 sentence answer from Gemini suitable for TTS."""
	system_prompt = (
		"You are a helpful assistant. Answer very concisely (2–3 sentences max). "
		"Do NOT repeat or quote the question. Return only the answer text."
	)
	model = _require_gemini_model()
	try:
		resp = model.generate_content([
			{"role": "user", "parts": [system_prompt + f"\nQuestion: {topic}"]}
		])
		ans = (getattr(resp, "text", None) or "").strip()
		ans = _strip_prompt_echo(ans, prompts=[topic])
		if "\nQuestion:" in ans or ans.lower().endswith((" question:", " question")):
			lines = [ln for ln in ans.splitlines() if not ln.strip().lower().startswith("question:")]
			ans = " ".join(lines).strip()
		return ans
	except Exception as e:
		raise AIEnhancerError(f"Failed to get answer for topic: {e}")


# --- TTS helpers ---
def get_elevenlabs_client(api_key: str):
	if ElevenLabs is None:  # pragma: no cover
		raise AIEnhancerError("elevenlabs package not installed")
	return ElevenLabs(api_key=api_key)  # type: ignore[call-arg]


def generate_speech_from_text(
	text: str,
	voice_id: str | None = "19B4gjtpL5m876wS3Dfg",
	api_key: Optional[str] = None,
	provider: str = "elevenlabs",
	*,
	google_voice: str = "en-US-Neural2-C",
	speaking_rate: float = 1.0,
) -> AudioSegment:
	"""Synthesize speech using ElevenLabs or Google TTS.

	provider: 'elevenlabs' (default) or 'google'. If ElevenLabs fails, falls back to Google when available.
	"""
	if provider not in {"elevenlabs", "google"}:
		raise AIEnhancerError(f"Unsupported TTS provider: {provider}")

	errors: list[str] = []

	if provider == "elevenlabs":
		final_api_key = api_key or getattr(settings, "ELEVENLABS_API_KEY", None)
		if not final_api_key or str(final_api_key).strip().startswith("YOUR_"):
			errors.append("ElevenLabs API key not configured")
		else:
			client = get_elevenlabs_client(str(final_api_key))
			max_retries = 3
			retry_delay_seconds = 2
			for attempt in range(max_retries):
				try:
					stream = client.text_to_speech.stream(text=text, voice_id=voice_id or "19B4gjtpL5m876wS3Dfg")
					audio_bytes = b"".join(chunk for chunk in stream)
					if not audio_bytes:
						raise AIEnhancerError("Empty audio stream from ElevenLabs")
					buf = io.BytesIO(audio_bytes)
					return AudioSegment.from_file(buf, format="mp3")
				except ApiError as e:  # type: ignore[misc]
					status = getattr(e, "status_code", None)
					if status == 429 and attempt < max_retries - 1:
						logger.warning(
							"ElevenLabs rate limit (429). Retrying in %ss (Attempt %s/%s)",
							retry_delay_seconds, attempt + 1, max_retries,
						)
						time.sleep(retry_delay_seconds)
						continue
					if status == 404:
						errors.append(f"ElevenLabs voice not found (404) for voice_id={voice_id}")
						break
					errors.append(f"ElevenLabs ApiError: {e}")
					break
				except Exception as e:
					errors.append(f"ElevenLabs error: {e}")
					break

	# Requested Google explicitly or ElevenLabs attempt failed
	if provider == "google" or (provider == "elevenlabs" and errors):
		try:
			return synthesize_google_tts(text, voice_name=google_voice, speaking_rate=speaking_rate)
		except GoogleTTSNotConfigured as e:
			errors.append(str(e))
		except Exception as e:
			errors.append(f"Google TTS error: {e}")

	raise AIEnhancerError("; ".join(errors) or "Failed to synthesize speech")


__all__ = [
	"AIEnhancerError",
	"generate_metadata_from_transcript",
	"interpret_intern_command",
	"get_answer_for_topic",
	"generate_speech_from_text",
]


