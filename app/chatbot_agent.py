import os
import json
import logging
from typing import List, Dict, Optional, Tuple, Any
from dotenv import load_dotenv

# Use google-generativeai SDK
import google.generativeai as genai

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Model configuration
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
TEMPERATURE = float(os.environ.get("GEMINI_TEMPERATURE", "0.2"))

# Lazy-initialized model (don't cache errors to allow retry)
_model = None
_gemini_configured = False

def _get_model():
    """Get or create Gemini model (lazy init, retries on error)"""
    global _model, _gemini_configured
    
    if _model is not None:
        return _model
    
    # Get API key - supports multiple env var names
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    
    if not api_key:
        raise ValueError("Missing API key. Please set GOOGLE_CLOUD_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY in your environment.")
    
    try:
        if not _gemini_configured:
            genai.configure(api_key=api_key)
            _gemini_configured = True
        _model = genai.GenerativeModel(MODEL_NAME)
        logger.info(f"Gemini model initialized: {MODEL_NAME}")
        return _model
    except Exception as e:
        logger.error(f"Failed to initialize Gemini model: {e}")
        raise ValueError(f"Failed to initialize Gemini model: {str(e)}")

SYSTEM_PROMPT = """You are an expert R&D Tax Credit Auditor and a Portal Guide for the TaxScape Pro platform. 

### YOUR DUAL ROLE:
1.  **R&D Tax Auditor**: You act as an interviewer to determine if projects qualify for the R&D Tax Credit under IRS Section 41 and Section 174.
2.  **Portal Guide**: You help users navigate the TaxScape Pro portal, explaining where to find features and how to perform tasks.

### PORTAL GUIDANCE & ARCHITECTURE:
TaxScape Pro is a CPA-centric platform where a CPA Firm (Organization) manages multiple Client Companies.
- **Dashboard**: High-level overview of projects, tasks, and estimated R&D credits.
- **Clients**: (CPA/Admin Only) Manage the list of client companies. You can add new clients here.
- **Projects**: View and manage R&D projects for the currently selected client.
- **R&D Analysis**: The core tool where users upload spreadsheets/PDFs for AI-powered qualification analysis.
- **AI Assistant**: That's you! You are available in the top right to answer questions and guide the user.
- **Tasks & Team**: (Admin Only) Manage verification tasks and team members.
- **Budgets & Expenses**: Track R&D-related costs (Wages, Contractors, Supplies).

### R&D AUDIT EXPERTISE (FOUR-PART TEST):
You must enforce the "Four-Part Test" for every project:
1. **Permitted Purpose**: Is it intended to create or improve functionality, performance, reliability, or quality?
2. **Elimination of Uncertainty**: Does it attempt to eliminate technical uncertainty regarding capability, methodology, or design?
3. **Process of Experimentation**: Did the team use a systematic process of evaluating alternatives (simulation, trial and error, modeling)?
4. **Technological in Nature**: Does the process rely on hard sciences (CS, engineering, physics, biology)?

### CRITICAL RULES:
- Reject "business risks" or "market uncertainty". Focus ONLY on technical uncertainty.
- For Contractors: Ask if the work was performed in the US and if the company retains rights.
- For Wages: Ask for W-2 Box 1 wages.
- Section 174: Remind that domestic R&D costs are amortized over 5 years.

### INTERACTION FLOW:
1. If the user asks about the portal, explain the feature and where to find it.
2. If the user wants to start an audit, ask them to describe a project or upload files.
3. Ask clarifying questions to satisfy the 4-part test.
4. When user says "Generate Study" or similar - OUTPUT THE JSON SUMMARY.

### IMPORTANT - JSON OUTPUT RULES:
When generating a study, you MUST output valid JSON in exactly this format. Include the JSON at the END of your response.
- All number values must be actual numbers (not strings)
- Use lowercase boolean values: true/false

```json
{
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description of the R&D work",
      "technical_uncertainty": "What was technically unknown at the start",
      "process_of_experimentation": "How alternatives were evaluated and tested"
    }
  ],
  "wages": {
    "breakdown": [
      {
        "name": "Employee Name",
        "role": "Job Title",
        "box1_wages": 120000,
        "qualified_percent": 80
      }
    ]
  },
  "contractors": [
    {
      "name": "Contractor/Vendor Name",
      "cost": 50000,
      "is_qualified": true,
      "location": "US"
    }
  ],
  "summary": {
    "total_projects": 1,
    "total_employees": 1,
    "total_wages": 120000,
    "total_contractors": 1,
    "total_contractor_costs": 50000
  }
}
```"""


def _build_contents(messages: List[Dict[str, str]]) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Convert chat history into content payload for the API."""
    contents: List[Dict[str, Any]] = []
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
                contents.append({
                    "role": api_role,
                    "parts": [{"text": content_text}]
                })
        
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
    # Get model (lazy initialization with retry on error)
    try:
        model = _get_model()
    except ValueError as e:
        error_msg = str(e)
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
        
        # Build prompt from contents
        prompt_parts = []
        prompt_parts.append(system_instruction_text + "\n\n")
        for content in contents:
            if isinstance(content, dict):
                role = content.get("role", "user")
                parts = content.get("parts", [])
                for part in parts:
                    if isinstance(part, dict) and "text" in part:
                        prompt_parts.append(f"{role}: {part['text']}\n")
                    elif isinstance(part, str):
                        prompt_parts.append(f"{role}: {part}\n")
        
        response = model.generate_content(
            "".join(prompt_parts),
            generation_config=genai.types.GenerationConfig(
                temperature=TEMPERATURE,
                max_output_tokens=8192,
            )
        )

        # Extract text from response
        if hasattr(response, 'text') and response.text:
            logger.info(f"Received response of length: {len(response.text)}")
            return response.text
        
        # Fallback: try to extract from candidates
        if hasattr(response, 'candidates') and response.candidates and response.candidates[0].content.parts:
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
            return f"Model Not Found: The model '{MODEL_NAME}' is not available. Try setting GEMINI_MODEL=gemini-3-flash-preview.\n\nDetails: {error_msg}"
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
    
    import re
    
    try:
        # Method 1: Look for JSON in code blocks (```json ... ```)
        code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', response_text)
        if code_block_match:
            json_str = code_block_match.group(1)
            try:
                parsed = json.loads(json_str)
                if _is_valid_study_json(parsed):
                    logger.info(f"Extracted JSON from code block with keys: {list(parsed.keys())}")
                    return parsed
            except json.JSONDecodeError:
                pass
        
        # Method 2: Find the largest valid JSON object in the response
        # Look for opening braces and try to parse from each one
        best_json = None
        for match in re.finditer(r'\{', response_text):
            start = match.start()
            # Try to find matching closing brace
            brace_count = 0
            end = start
            for i, char in enumerate(response_text[start:], start):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end = i + 1
                        break
            
            if end > start:
                json_str = response_text[start:end]
                try:
                    parsed = json.loads(json_str)
                    if _is_valid_study_json(parsed):
                        # Prefer larger/more complete JSON
                        if best_json is None or len(json_str) > len(str(best_json)):
                            best_json = parsed
                except json.JSONDecodeError:
                    continue
        
        if best_json:
            logger.info(f"Successfully extracted JSON with keys: {list(best_json.keys())}")
            return best_json
        
        logger.info("No valid study JSON found in response")
        return None
        
    except Exception as e:
        logger.error(f"Unexpected error extracting JSON: {str(e)}", exc_info=True)
        return None


def _is_valid_study_json(data: Dict) -> bool:
    """Check if the JSON looks like a valid R&D study structure."""
    if not isinstance(data, dict):
        return False
    
    # Must have at least one of these key sections
    valid_keys = {'projects', 'wages', 'contractors', 'summary'}
    has_valid_key = any(key in data for key in valid_keys)
    
    # Reject if it's just a small config-like object
    if len(data) < 2 and not has_valid_key:
        return False
    
    return has_valid_key
