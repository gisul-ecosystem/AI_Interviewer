from models.schemas import InterviewConfig, Question


def build_question_generation_prompt(config: InterviewConfig) -> str:
    return (
        f"You are an expert interviewer. Generate exactly {config.num_questions} interview "
        f"questions for the following candidate profile:\n"
        f"- Role: {config.role}\n"
        f"- Domain: {config.domain}\n"
        f"- Experience: {config.experience_min}-{config.experience_max} years\n"
        f"- Interview type: {config.interview_type}\n"
        f"- Difficulty: {config.difficulty}\n"
        f"- JD: {config.jd}\n\n"
        "Return ONLY a valid JSON array. No markdown, no code blocks, "
        "no explanation. Start your response with [ and end with ]\n\n"
        "Each object in the array must have:\n"
        "- id (int, starting from 1)\n"
        "- text (the question string)\n"
        "- rubric (2-3 sentences describing what a strong answer covers)\n"
        '- difficulty_tag ("warm_up", "core", or "stretch")\n'
        "- weight (int, marks out of 10)\n\n"
        "Use this distribution:\n"
        "- 2 warm_up: conversational, about background and basics\n"
        "- Rest core: directly testing skills mentioned in JD\n"
        "- 1-2 stretch: scenario-based or advanced problem-solving\n"
    )


def build_interviewer_system_prompt(
    config: InterviewConfig, questions: list[Question]
) -> str:
    numbered_questions = "\n".join(
        [f"{idx}. {question.text}" for idx, question in enumerate(questions, start=1)]
    )
    return (
        'You are "Alex", an AI interviewer with a professional and friendly tone.\n'
        f"You are interviewing {config.candidate_name} for {config.role}.\n"
        f"Required experience: {config.experience_min}-{config.experience_max} years.\n\n"
        "Ask this question list in order:\n"
        f"{numbered_questions}\n\n"
        "Rules:\n"
        "* Ask questions in order. Do not skip or reorder.\n"
        "* After candidate answers, give ONE brief natural acknowledgement "
        "(max 10 words), then ask the next question immediately.\n"
        "* If the answer is very short (under 20 words) or clearly incomplete, "
        "ask ONE follow-up probe. Only one probe per question, never repeat.\n"
        "* Never reveal the rubric or scoring criteria to the candidate.\n"
        "* Never ask two questions in one message.\n"
        "* Keep all responses under 60 words. This will be spoken aloud.\n"
        f'* When all {config.num_questions} questions are done, say exactly: '
        '"Thank you for your time [name]. That completes your interview. '
        'We will be in touch soon."\n'
        "* Address the candidate by first name naturally but not in every message.\n"
    )


def build_scoring_prompt(question: Question, candidate_answer: str) -> str:
    return (
        "You are scoring an interview answer.\n\n"
        f"Question:\n{question.text}\n\n"
        f"Rubric:\n{question.rubric}\n\n"
        f"Candidate answer:\n{candidate_answer}\n\n"
        "Return ONLY valid JSON, no markdown.\n"
        "JSON shape:\n"
        "{\n"
        '  "score": (int 1-5),\n'
        '  "justification": (string, 1-2 sentences),\n'
        '  "key_points_covered": (list of strings),\n'
        '  "missing_points": (list of strings)\n'
        "}\n\n"
        "Scoring guide:\n"
        "1 = completely missed the point\n"
        "2 = partial, major gaps\n"
        "3 = adequate, covers basics\n"
        "4 = good, covers most rubric points\n"
        "5 = excellent, comprehensive and insightful\n"
    )


def get_domain_keywords(config: InterviewConfig) -> list[str]:
    base_keywords = [
        "API",
        "database",
        "system",
        "architecture",
        "performance",
        "scalable",
        "deployment",
    ]

    domain_map = {
        "backend": [
            "FastAPI",
            "Django",
            "Flask",
            "PostgreSQL",
            "MongoDB",
            "Redis",
            "Docker",
            "Kubernetes",
            "microservices",
            "REST",
            "GraphQL",
            "async",
        ],
        "frontend": [
            "React",
            "Next.js",
            "TypeScript",
            "Tailwind",
            "Redux",
            "webpack",
            "SSR",
            "components",
            "hooks",
        ],
        "data": [
            "Pandas",
            "Spark",
            "Airflow",
            "ETL",
            "pipeline",
            "Snowflake",
            "dbt",
            "Kafka",
            "warehouse",
            "schema",
        ],
        "devops": [
            "CI/CD",
            "Jenkins",
            "Terraform",
            "AWS",
            "Azure",
            "GCP",
            "monitoring",
            "Grafana",
            "Prometheus",
        ],
        "ml": [
            "PyTorch",
            "TensorFlow",
            "model",
            "training",
            "inference",
            "feature",
            "accuracy",
            "pipeline",
        ],
    }

    domain_lower = config.domain.lower()
    for key, keywords in domain_map.items():
        if key in domain_lower:
            return base_keywords + keywords

    return base_keywords
