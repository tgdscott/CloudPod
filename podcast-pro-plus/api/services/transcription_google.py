import io
import os
from pathlib import Path
from typing import List, Dict, Any

from google.cloud import speech_v1p1beta1 as speech
from pydub import AudioSegment

from api.core.paths import MEDIA_DIR

CHUNK_DURATION_MS = 10 * 60 * 1000  # reuse chunk size

class GoogleTranscriptionError(Exception):
    pass

def google_transcribe_with_words(filename: str) -> List[Dict[str, Any]]:
    audio_path = MEDIA_DIR / filename
    if not audio_path.exists():
        raise GoogleTranscriptionError(f"Audio file not found: {filename}")

    client = speech.SpeechClient()

    try:
        audio = AudioSegment.from_file(audio_path)
        chunks = [audio[i:i + CHUNK_DURATION_MS] for i in range(0, len(audio), CHUNK_DURATION_MS)]
        all_words: List[Dict[str, Any]] = []
        time_offset_s = 0.0

        for idx, chunk in enumerate(chunks):
            buffer = io.BytesIO()
            chunk.export(buffer, format="flac")  # lossless for better accuracy
            buffer.seek(0)
            content = buffer.read()

            audio_bytes = speech.RecognitionAudio(content=content)
            # Note: Google Speech API does not provide a direct 'do not censor' flag here.
            # We keep automatic punctuation but rely on the raw words list which generally
            # includes profanity intact in 'word' tokens.
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.FLAC,
                language_code="en-US",
                enable_word_time_offsets=True,
                enable_automatic_punctuation=True,
                model="latest_long"
            )
            response = client.recognize(config=config, audio=audio_bytes)
            for result in response.results:
                alt = result.alternatives[0]
                for w in alt.words:
                    all_words.append({
                        "word": w.word,
                        "start": (w.start_time.seconds + w.start_time.nanos/1e9) + time_offset_s,
                        "end": (w.end_time.seconds + w.end_time.nanos/1e9) + time_offset_s,
                    })
            time_offset_s += chunk.duration_seconds
        return all_words
    except Exception:
        raise
