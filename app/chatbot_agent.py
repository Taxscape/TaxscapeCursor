import os
import json
from typing import List, Dict
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Get API key - supports both env var names
API_KEY = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "Missing API key. Set GOOGLE_CLOUD_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY in your .env file."
    )

# Model configuration - use a stable model that works with AI Studio
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
TEMPERATURE = float(os.environ.get("GEMINI_TEMPERATURE", "0.2"))

# Initialize client for Gemini Developer API (AI Studio) - NOT Vertex AI
# Your API key (AQ.Ab8RN6J...) is an AI Studio key, so we use api_key only (no vertexai=True)
client = genai.Client(api_key=API_KEY)

SYSTEM_PROMPT = """You are an expert R&D Tax Credit Auditor acting as an interviewer. Your goal is to determine if the user's projects qualify for the R&D Tax Credit under IRS Section 41 and Section 174.

You must enforce the "Four-Part Test":
1. Permitted Purpose: Is the project intended to create or improve functionality, performance, reliability, or quality?
2. Elimination of Uncertainty: Does the project attempt to eliminate technical uncertainty regarding capability, methodology, or design?
3. Process of Experimentation: Did the team use a systematic process of evaluating alternatives (simulation, trial and error, modeling)?
4. Technological in Nature: Does the process rely on hard sciences (CS, engineering, physics, biology)?

CRITICAL RULES:
- Reject "business risks" or "market uncertainty". Focus ONLY on technical uncertainty.
- For Contractors: Ask if the work was performed in the US and if the company retains rights. If qualified, note that the 65% rule applies (but you calculate the QRE amount later, just identify the cost).
- For Wages: Ask for W-2 Box 1 wages.
- Section 174: Remind that domestic R&D costs are amortized over 5 years (10% yr 1).

INTERACTION FLOW:
1. Ask the user to describe a project.
2. Ask clarifying questions to satisfy the 4-part test.
3. If satisfied, move to the next project or ask for costs/personnel involved.
4. If the user says "Generate Study" or "Done", output a JSON summary of all identified data.

JSON OUTPUT FORMAT (only when requested to generate study):
{
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "technical_uncertainty": "What was unknown",
      "process_of_experimentation": "How it was tested",
      "contractors": [
        {"name": "Contractor Name", "cost": 10000, "is_qualified": true}
      ],
      "allocations": [
        {"employee_name": "John Doe", "allocation_percent": 80}
      ]
    }
  ]
}"""


def _build_contents(messages: List[Dict[str, str]]) -> List[types.Content]:
    """Convert chat history into content payload for the API."""
    contents: List[types.Content] = []
    for message in messages:
        role = message.get("role", "user")
        if role == "system":
            continue
        # Map roles: "user" stays "user", "assistant" becomes "model"
        api_role = "user" if role == "user" else "model"
        contents.append(
            types.Content(
                role=api_role,
                parts=[types.Part.from_text(text=message.get("content", ""))]
            )
        )
    return contents


def get_chat_response(messages):
    """
    Sends the conversation history to Gemini and returns the response text.
    messages: list of {"role": "user"|"assistant", "content": "text"}
    """
    try:
        contents = _build_contents(messages)

        # Use a simple, stable configuration that works with AI Studio
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=TEMPERATURE,
                max_output_tokens=8192,
                system_instruction=SYSTEM_PROMPT,
            ),
        )

        # Extract text from response
        if response.text:
            return response.text
        
        # Fallback: try to extract from candidates
        if response.candidates and response.candidates[0].content.parts:
            return "".join(
                part.text for part in response.candidates[0].content.parts if getattr(part, "text", None)
            )

        return "The Gemini model returned no content."
    except Exception as e:
        error_msg = str(e)
        # Provide more helpful error messages
        if "401" in error_msg or "UNAUTHENTICATED" in error_msg:
            return f"Error: API key authentication failed. Please check your GOOGLE_CLOUD_API_KEY in .env. Details: {error_msg}"
        elif "400" in error_msg or "INVALID_ARGUMENT" in error_msg:
            return f"Error: Invalid request to Gemini API. This may be a model or parameter issue. Details: {error_msg}"
        elif "404" in error_msg or "NOT_FOUND" in error_msg:
            return f"Error: Model '{MODEL_NAME}' not found. Try setting GEMINI_MODEL=gemini-1.5-flash in .env. Details: {error_msg}"
        else:
            return f"Error communicating with AI: {error_msg}"


def extract_json_from_response(response_text):
    """
    Attempts to parse JSON from the AI's response.
    Returns dict or None.
    """
    try:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start != -1 and end != -1:
            json_str = response_text[start:end]
            return json.loads(json_str)
        return None
    except json.JSONDecodeError:
        return None
