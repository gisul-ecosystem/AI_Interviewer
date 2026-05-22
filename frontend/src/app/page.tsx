"use client";

import { useState } from "react";

import ResultsPanel from "@/components/ResultsPanel";
import SetupForm from "@/components/SetupForm";
import VoiceInterview from "@/components/VoiceInterview";
import type { SetupResponse } from "@/types/interview";

type Stage = "setup" | "voice" | "results";

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [livekitToken, setLivekitToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [role, setRole] = useState("");
  const [setupResponse, setSetupResponse] = useState<SetupResponse | null>(null);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      {stage === "setup" && (
        <SetupForm
          onSetupComplete={(response, cfg) => {
            if (!response.livekit_token || !response.livekit_url) return;
            setLivekitUrl(response.livekit_url);
            setLivekitToken(response.livekit_token);
            setSessionId(response.session_id);
            setCandidateName(cfg.candidate_name);
            setRole(cfg.role);
            setSetupResponse(response);
            setStage("voice");
          }}
        />
      )}

      {stage === "voice" && setupResponse && (
        <VoiceInterview
          livekitUrl={livekitUrl}
          livekitToken={livekitToken}
          sessionId={sessionId}
          candidateName={candidateName}
          role={role}
          onComplete={(sid) => {
            setSessionId(sid);
            setStage("results");
          }}
        />
      )}

      {stage === "results" && <ResultsPanel sessionId={sessionId} />}
    </main>
  );
}
