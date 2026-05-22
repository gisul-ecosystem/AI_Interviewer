"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarVisualizer,
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
} from "@livekit/components-react";
import "@livekit/components-styles";

type Props = {
  livekitUrl: string;
  livekitToken: string;
  sessionId: string;
  candidateName: string;
  role: string;
  onComplete: (sessionId: string) => void;
};

function InterviewRoom({ sessionId, candidateName, role, onComplete }: Omit<Props, "livekitUrl" | "livekitToken">) {
  const { state, audioTrack } = useVoiceAssistant();
  const [isComplete, setIsComplete] = useState(false);
  const completeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    console.log("Agent state:", state);
  }, [state]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/interview/session/${sessionId}`);
        const data = (await res.json()) as { status?: string };
        if (data.status === "completed") {
          setIsComplete(true);
          clearInterval(interval);
          completeTimerRef.current = window.setTimeout(() => onComplete(sessionId), 3000);
        }
      } catch (e) {
        console.error(e);
      }
    }, 4000);
    return () => {
      window.clearInterval(interval);
      if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
    };
  }, [sessionId, onComplete]);

  const stateMessages: Record<string, string> = {
    connecting: "Connecting to Alex...",
    initializing: "Alex is getting ready...",
    listening: "Alex is listening...",
    thinking: "Alex is thinking...",
    speaking: "Alex is speaking...",
    idle: "Your turn - speak now",
  };

  const stateColors: Record<string, string> = {
    listening: "text-green-400",
    thinking: "text-yellow-400",
    speaking: "text-blue-400",
    idle: "text-gray-300",
    connecting: "text-gray-400",
    initializing: "text-gray-400",
  };

  const stateKey = String(state ?? "connecting").toLowerCase();

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "white", padding: "2rem" }}>
      {/* THIS IS THE KEY FIX — renders agent audio to speakers */}
      <RoomAudioRenderer />

      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 500, margin: 0 }}>Interview - {role}</h1>
        <p style={{ color: "#888", margin: "0.5rem 0 0" }}>Candidate: {candidateName}</p>
      </div>

      <div style={{ width: 120, height: 120, borderRadius: "50%", background: "#1a1a2e", border: "2px solid #333", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem", fontSize: "2.5rem" }}>
        A
      </div>

      {stateKey === "speaking" && audioTrack && (
        <div style={{ marginBottom: "1.5rem", width: 200 }}>
          <BarVisualizer state={state} barCount={7} trackRef={audioTrack} style={{ height: 48 }} />
        </div>
      )}

      <p style={{ fontSize: "1.1rem", marginBottom: "2rem" }} className={stateColors[stateKey] || ""}>
        {stateMessages[stateKey] || "Connecting..."}
      </p>

      {isComplete && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
          <div style={{ fontSize: "3rem" }}>✓</div>
          <h2 style={{ fontSize: "1.5rem", margin: 0 }}>Interview Complete</h2>
          <p style={{ color: "#888" }}>Loading your results...</p>
        </div>
      )}
    </div>
  );
}

export default function VoiceInterview({ livekitUrl, livekitToken, sessionId, candidateName, role, onComplete }: Props) {
  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={livekitToken}
      connect={true}
      audio={true}
      video={false}
      onConnected={() => console.log("LiveKit CONNECTED successfully")}
      onDisconnected={(reason) => console.log("LiveKit DISCONNECTED", reason)}
      onError={(error) => console.error("LiveKit CONNECTION ERROR", error)}
    >
      <InterviewRoom sessionId={sessionId} candidateName={candidateName} role={role} onComplete={onComplete} />
    </LiveKitRoom>
  );
}
