import json
import logging

from openai import AsyncOpenAI

from core.config import settings
from interviewer.prompts import build_question_generation_prompt
from models.schemas import InterviewConfig, Question

logger = logging.getLogger(__name__)


async def generate_questions(config: InterviewConfig) -> list[Question]:
    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = build_question_generation_prompt(config)

        response = await client.chat.completions.create(
            model=settings.MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2500,
        )

        response_text = response.choices[0].message.content or ""
        raw_response = response_text

        response_text = response_text.strip()
        # Strip markdown fences if the model returns them (defensive).
        if response_text.startswith("```json"):
            response_text = response_text[len("```json") :].lstrip()
        elif response_text.startswith("```"):
            response_text = response_text[len("```") :].lstrip()

        if response_text.endswith("```"):
            response_text = response_text[: -len("```")].rstrip()

        parsed = json.loads(response_text)
        questions = [Question(**item) for item in parsed]
        return questions
    except Exception as error:
        logger.error("Raw question generation response: %s", locals().get("raw_response"))
        raise ValueError(f"Question generation failed: {error}") from error
