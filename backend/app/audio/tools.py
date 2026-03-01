import os
from dotenv import load_dotenv

load_dotenv()


def get_mistral_tools() -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": "add_sound_effect",
                "description": (
                    "Generate a sound effect using AI and mix it into the current video "
                    "clip at a specific timestamp. The sound effect is generated from a "
                    "natural-language description."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "description": {
                            "type": "string",
                            "description": (
                                "What the sound effect should sound like, "
                                "e.g. 'dramatic cinematic boom', "
                                "'glass shattering', 'crowd cheering'"
                            ),
                        },
                        "timestamp": {
                            "type": "number",
                            "description": "When (in seconds) the sound effect should start.",
                        },
                        "duration": {
                            "type": "number",
                            "description": "Duration of the sound effect in seconds. Default 2.0.",
                            "default": 2.0,
                        },
                        "volume": {
                            "type": "number",
                            "description": (
                                "Volume of the sound effect relative to the original audio "
                                "(0.0–1.0). Default 0.8."
                            ),
                            "default": 0.8,
                        },
                    },
                    "required": ["description", "timestamp"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "add_multiple_sound_effects",
                "description": (
                    "Generate and mix multiple sound effects into the current video clip "
                    "in a single efficient FFmpeg pass."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "effects": {
                            "type": "array",
                            "description": "List of sound effects to apply.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {
                                        "type": "string",
                                        "description": "What the sound effect should sound like.",
                                    },
                                    "timestamp": {
                                        "type": "number",
                                        "description": "Start time in seconds.",
                                    },
                                    "duration": {
                                        "type": "number",
                                        "description": "Duration in seconds. Default 2.0.",
                                    },
                                    "volume": {
                                        "type": "number",
                                        "description": "Relative volume 0.0–1.0. Default 0.8.",
                                    },
                                },
                                "required": ["description", "timestamp"],
                            },
                        },
                    },
                    "required": ["effects"],
                },
            },
        },
    ]


if __name__ == "__main__":
    import json
    print(json.dumps(get_mistral_tools(), indent=2))
