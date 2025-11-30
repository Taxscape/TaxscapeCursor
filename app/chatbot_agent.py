import os
import json
import logging
from typing import List, Dict, Optional, Tuple
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Get API key - supports multiple env var names
API_KEY = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

# Model configuration
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
TEMPERATURE = float(os.environ.get("GEMINI_TEMPERATURE", "0.2"))

# Initialize client with error handling
client = None
client_error = None

try:
    if not API_KEY:
        client_error = "Missing API key. Please set GOOGLE_CLOUD_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY in your environment."
        logger.error(client_error)
    else:
        logger.info(f"Initializing Gemini client with model: {MODEL_NAME}")
        client = genai.Client(api_key=API_KEY)
        logger.info("Gemini client initialized successfully")
except Exception as e:
    client_error = f"Failed to initialize Gemini client: {str(e)}"
    logger.error(client_error, exc_info=True)

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
      "process_of_experimentation": "How it was tested"
    }
  ],
  "wages": {
    "breakdown": [
      {"name": "Employee Name", "box1_wages": 120000, "qualified_percent": 80}
    ]
  },
  "contractors": [
    {"name": "Contractor Name", "cost": 10000, "is_qualified": true}
  ]
}"""


def _build_contents(messages: List[Dict[str, str]]) -> Tuple[List[types.Content], Optional[str]]:
    """Convert chat history into content payload for the API."""
    contents: List[types.Content] = []
    system_context = None
    
    try:
        # Extract system message if present
        for message in messages:
            if message.get("role") == "system":
                system_context = message.get("content", "")
                break
        
        # Build contents from non-system messages
        for message in messages:
            role = message.get("role", "user")
            if role == "system":
                continue
            # Map roles: "user" stays "user", "assistant" becomes "model"
            api_role = "user" if role == "user" else "model"
            content_text = message.get("content", "")
            
            if content_text:  # Only add if there's actual content
                contents.append(
                    types.Content(
                        role=api_role,
                        parts=[types.Part.from_text(text=content_text)]
                    )
                )
        
        logger.info(f"Built {len(contents)} content items from {len(messages)} messages")
        return contents, system_context
    except Exception as e:
        logger.error(f"Error building contents: {str(e)}", exc_info=True)
        return [], system_context


def get_chat_response(messages: List[Dict[str, str]], user_context: Optional[str] = None) -> str:
    """
    Sends the conversation history to Gemini and returns the response text.
    
    Args:
        messages: list of {"role": "user"|"assistant"|"system", "content": "text"}
        user_context: optional additional context string to prepend to system instruction
    
    Returns:
        Response text from Gemini or error message
    """
    # Check if client is available
    if client is None:
        error_msg = client_error or "Gemini client not initialized"
        logger.error(f"Cannot get chat response: {error_msg}")
        return f"I'm currently unable to connect to the AI service. Error: {error_msg}\n\nPlease ensure the GOOGLE_CLOUD_API_KEY environment variable is set correctly."
    
    try:
        logger.info(f"Processing chat request with {len(messages)} messages")
        
        contents, system_context = _build_contents(messages)
        
        if not contents:
            logger.warning("No valid contents to send to Gemini")
            return "I didn't receive a valid message. Could you please try again?"
        
        # Combine system prompt with user context if provided
        system_instruction_text = SYSTEM_PROMPT
        if system_context:
            system_instruction_text = system_context + "\n\n" + SYSTEM_PROMPT
            logger.info("Added system context to instruction")
        elif user_context:
            system_instruction_text = user_context + "\n\n" + SYSTEM_PROMPT
            logger.info("Added user context to instruction")

        logger.info(f"Calling Gemini model: {MODEL_NAME} with temperature: {TEMPERATURE}")
        
        # Call Gemini API
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=TEMPERATURE,
                max_output_tokens=8192,
                system_instruction=system_instruction_text,
            ),
        )

        # Extract text from response
        if response.text:
            logger.info(f"Received response of length: {len(response.text)}")
            return response.text
        
        # Fallback: try to extract from candidates
        if response.candidates and response.candidates[0].content.parts:
            text_parts = [
                part.text for part in response.candidates[0].content.parts 
                if getattr(part, "text", None)
            ]
            if text_parts:
                result = "".join(text_parts)
                logger.info(f"Extracted response from candidates: length {len(result)}")
                return result

        logger.warning("Gemini returned no content")
        return "I apologize, but I didn't generate a response. Could you please rephrase your question?"
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in get_chat_response: {error_msg}", exc_info=True)
        
        # Provide helpful error messages
        if "401" in error_msg or "UNAUTHENTICATED" in error_msg:
            return f"Authentication Error: The API key is invalid or expired. Please check your GOOGLE_CLOUD_API_KEY.\n\nDetails: {error_msg}"
        elif "400" in error_msg or "INVALID_ARGUMENT" in error_msg:
            return f"Invalid Request: There was an issue with the request format.\n\nDetails: {error_msg}"
        elif "404" in error_msg or "NOT_FOUND" in error_msg:
            return f"Model Not Found: The model '{MODEL_NAME}' is not available. Try setting GEMINI_MODEL=gemini-1.5-flash.\n\nDetails: {error_msg}"
        elif "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            return "Rate Limit: Too many requests. Please wait a moment and try again."
        elif "quota" in error_msg.lower():
            return f"Quota Exceeded: The API quota has been reached.\n\nDetails: {error_msg}"
        else:
            return f"Error: I encountered an issue while processing your request.\n\nDetails: {error_msg}\n\nPlease try again or contact support if the issue persists."


def extract_json_from_response(response_text: str) -> Optional[Dict]:
    """
    Attempts to parse JSON from the AI's response.
    
    Args:
        response_text: The response text from Gemini
    
    Returns:
        Parsed JSON dict or None if not found/invalid
    """
    if not response_text:
        return None
        
    try:
        # Look for JSON in the response
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        
        if start != -1 and end > start:
            json_str = response_text[start:end]
            parsed = json.loads(json_str)
            logger.info(f"Successfully extracted JSON with keys: {list(parsed.keys())}")
            return parsed
        
        logger.info("No JSON found in response")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON from response: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error extracting JSON: {str(e)}", exc_info=True)
        return None
