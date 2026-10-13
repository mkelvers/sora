"""Finds the words spoken in an audio file, and when, for subtitle alignment.

Usage: python transcribe.py AUDIO [MODEL]

AUDIO is a 16 kHz mono WAV file. Prints one JSON object on standard output:
{"words": [{"text": "Hello,", "start": 1.52, "end": 1.9}, ...]}, times in
seconds. Needs `faster-whisper`; the model is downloaded on first use.
"""

import json
import sys
import wave

import numpy
from faster_whisper import WhisperModel


def read_samples(path: str) -> numpy.ndarray:
    with wave.open(path, "rb") as file:
        if file.getframerate() != 16_000 or file.getnchannels() != 1 or file.getsampwidth() != 2:
            raise ValueError("expected 16 kHz mono 16-bit WAV")
        pcm = numpy.frombuffer(file.readframes(file.getnframes()), dtype=numpy.int16)
    return pcm.astype(numpy.float32) / 32768.0


def main() -> None:
    samples = read_samples(sys.argv[1])
    name = sys.argv[2] if len(sys.argv) > 2 else "small.en"

    model = WhisperModel(name, device="cpu", compute_type="int8")
    # Greedy decoding is several times faster than the default beam search and
    # words and their times are what is needed. Speech detection skips music
    # and silence, and each stretch is decoded on its own so a mistake in one
    # does not carry into the next.
    segments, _ = model.transcribe(
        samples,
        language="en",
        beam_size=1,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    words = [
        {"text": word.word.strip(), "start": round(word.start, 2), "end": round(word.end, 2)}
        for segment in segments
        for word in segment.words or []
    ]
    json.dump({"words": words}, sys.stdout)


if __name__ == "__main__":
    main()
