export interface InterviewConfig {
  role: string;
  jd: string;
  experience_min: number;
  experience_max: number;
  domain: string;
  interview_type: "technical" | "behavioural" | "mixed";
  difficulty: "easy" | "medium" | "hard";
  num_questions: number;
  candidate_name: string;
}

export interface Question {
  id: number;
  text: string;
  difficulty_tag: "warm_up" | "core" | "stretch";
  weight: number;
}

export interface Turn {
  role: "interviewer" | "candidate";
  text: string;
  timestamp: string;
}

export interface SetupResponse {
  session_id: string;
  candidate_name: string;
  role: string;
  questions_count: number;
  questions?: Question[];
  livekit_url?: string;
  livekit_token?: string;
  room_name?: string;
}

export interface ChatResponse {
  reply: string;
  is_complete: boolean;
  turn_count: number;
}

export interface ScoreData {
  score: number;
  justification: string;
  key_points_covered: string[];
  missing_points: string[];
}

export interface ScoresResponse {
  session_id: string;
  scores: Record<string, ScoreData>;
}
