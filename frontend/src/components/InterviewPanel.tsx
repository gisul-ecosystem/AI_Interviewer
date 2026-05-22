"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { scoreInterview, sendMessage } from "@/lib/api";
import type {
  InterviewConfig,
  ScoresResponse,
  SetupResponse,
  Turn,
} from "@/types/interview";
import ChatWindow from "@/components/ChatWindow";

const USE_PRODUCTION_VOICE = true;

type Props = {
  sessionId: string;
  config: InterviewConfig;
  setupResponse: SetupResponse;
  onComplete: (scores: ScoresResponse) => void;
};

const nowIso = () => new Date().toISOString();

export default function InterviewPanel({
  sessionId,
  config,
  setupResponse,
  onComplete,
}: Props) {
  const initialTurn: Turn = useMemo(
    () => ({
      role: "interviewer",
      text: `Hi ${config.candidate_name}, I'm Alex. I'll be conducting your interview for ${config.role} today. Let's get started whenever you're ready. Could you begin by telling me a little about yourself?`,
      timestamp: nowIso(),
    }),
    [config.candidate_name, config.role]
  );

  const [turns, setTurns] = useState<Turn[]>([initialTurn]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");
  const [isScoring, setIsScoring] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  const dgSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackCursorRef = useRef(0);
  const isVoiceModeRef = useRef(false);
  const isCompleteRef = useRef(false);

  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  useEffect(() => {
    isCompleteRef.current = isComplete;
  }, [isComplete]);

  const submitVoiceAnswer = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLiveTranscript("");
    void send(trimmed);
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (dgSocketRef.current) {
      dgSocketRef.current.close();
      dgSocketRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript("");
  };

  const startListening = async () => {
    if (!isVoiceModeRef.current || isLoading || isSpeaking || isCompleteRef.current) {
      return;
    }

    try {
      stopListening();
      setError("");
      setLiveTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      const ws = new WebSocket(`ws://localhost:8000/api/interview/listen/${sessionId}`);
      dgSocketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type: string;
            text?: string;
            message?: string;
          };

          if (payload.type === "transcript") {
            setLiveTranscript(payload.text || "");
          } else if (payload.type === "utterance_end") {
            const finalText = payload.text || "";
            if (finalText.trim().length > 3) {
              stopListening();
              submitVoiceAnswer(finalText);
            }
          } else if (payload.type === "error") {
            // eslint-disable-next-line no-console
            console.error("Deepgram error:", payload.message);
            setIsListening(false);
          }
        } catch {
          setError("Invalid transcript payload");
        }
      };

      ws.onerror = () => {
        setError("Deepgram connection error");
        setIsListening(false);
      };

      ws.onclose = () => {
        setIsListening(false);
      };

      ws.onopen = () => {
        try {
          const recorder = new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus",
          });
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };

          recorder.start(250);
          setIsListening(true);
        } catch {
          setError("Microphone access failed");
          setIsListening(false);
        }
      };
    } catch {
      setError("Unable to start listening");
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const speakWithBrowserTTS = (text: string, shouldContinueLoop: boolean) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.name.includes("Google UK English Female")) ||
        voices.find((v) => v.name.includes("Microsoft"));
      if (preferred) utterance.voice = preferred;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        if (shouldContinueLoop && isVoiceModeRef.current && !isCompleteRef.current) {
          void startListening();
        }
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        if (shouldContinueLoop && isVoiceModeRef.current && !isCompleteRef.current) {
          void startListening();
        }
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
      if (shouldContinueLoop && isVoiceModeRef.current && !isCompleteRef.current) {
        void startListening();
      }
    }
  };

  const playAudioStreamFromBackend = async (
    text: string,
    shouldContinueLoop: boolean
  ) => {
    try {
      const response = await fetch("http://localhost:8000/api/interview/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, session_id: sessionId }),
      });
      if (!response.ok || !response.body) {
        throw new Error("Backend TTS failed");
      }

      setIsSpeaking(true);
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioCtx = audioContextRef.current;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, cur) => acc + cur.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const buffer = await audioCtx.decodeAudioData(merged.buffer);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);

      const startAt = Math.max(playbackCursorRef.current, audioCtx.currentTime);
      source.start(startAt);
      playbackCursorRef.current = startAt + buffer.duration;

      source.onended = () => {
        setIsSpeaking(false);
        if (shouldContinueLoop && isVoiceModeRef.current && !isCompleteRef.current) {
          void startListening();
        }
      };
    } catch {
      setIsSpeaking(false);
      speakWithBrowserTTS(text, shouldContinueLoop);
    }
  };

  const speakReply = (text: string, shouldContinueLoop: boolean) => {
    if (USE_PRODUCTION_VOICE) {
      void playAudioStreamFromBackend(text, shouldContinueLoop);
      return;
    }
    speakWithBrowserTTS(text, shouldContinueLoop);
  };

  const send = async (message?: string) => {
    const trimmed = (message ?? inputText).trim();
    if (!trimmed || isLoading || isComplete) return;

    setError("");
    setIsLoading(true);
    setInputText("");
    setLiveTranscript("");
    stopListening();

    const candidateTurn: Turn = {
      role: "candidate",
      text: trimmed,
      timestamp: nowIso(),
    };
    setTurns((prev) => [...prev, candidateTurn]);

    try {
      const response = await sendMessage(sessionId, trimmed);
      const interviewerTurn: Turn = {
        role: "interviewer",
        text: response.reply,
        timestamp: nowIso(),
      };
      setTurns((prev) => [...prev, interviewerTurn]);
      setIsComplete(response.is_complete);
      if (isVoiceMode) {
        speakReply(response.reply, !response.is_complete);
      }
      if (response.is_complete) {
        stopListening();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "WebSocket" in window &&
      "MediaRecorder" in window &&
      "mediaDevices" in navigator;
    setVoiceSupported(supported);

    return () => {
      stopListening();
      window.speechSynthesis.cancel();
      audioContextRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!voiceSupported || !isVoiceMode) {
      stopListening();
      stopSpeaking();
      return;
    }
    if (!isLoading && !isComplete && !isSpeaking) {
      void startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceMode, voiceSupported, isLoading, isComplete, isSpeaking]);

  const handleGetResults = async () => {
    setError("");
    setIsScoring(true);
    try {
      const results = await scoreInterview(sessionId);
      onComplete(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to score interview");
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Interview - {config.role}
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600">Progress: {turns.length} turns</p>
          {voiceSupported && (
            <button
              type="button"
              onClick={() => setIsVoiceMode((prev) => !prev)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {isVoiceMode ? "Text Mode" : "Voice Mode"}
            </button>
          )}
        </div>
      </div>

      <ChatWindow turns={turns} candidateName={config.candidate_name} />

      {isLoading && (
        <p className="text-sm text-slate-500">Alex is typing...</p>
      )}

      {!isVoiceMode ? (
        <div className="space-y-2">
          <textarea
            rows={3}
            placeholder="Type your response..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={isLoading || isComplete}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 focus:ring disabled:bg-slate-100"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Press Enter to send, Shift+Enter for new line
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={isLoading || isComplete || !inputText.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-center text-sm text-slate-600">
            {isSpeaking
              ? "Alex is speaking..."
              : isListening
              ? "Listening..."
              : "Tap mic to speak"}
          </p>
          {isListening && (
            <div className="mx-auto max-w-xl rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <p className="mb-1 text-xs font-medium text-blue-700">
                Capturing your answer
                <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              </p>
              <p className="text-slate-700">{liveTranscript || "Start speaking..."}</p>
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  const text = liveTranscript.trim();
                  stopListening();
                  if (text.length > 3) {
                    submitVoiceAnswer(text);
                  }
                } else {
                  void startListening();
                }
              }}
              disabled={isSpeaking || isComplete}
              className={`h-16 w-16 rounded-full text-white transition ${
                isListening
                  ? "animate-pulse bg-emerald-500 hover:bg-emerald-600"
                  : "bg-slate-500 hover:bg-slate-600"
              } disabled:cursor-not-allowed disabled:bg-slate-300`}
              aria-label="Microphone"
            >
              Mic
            </button>
            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Stop
              </button>
            )}
          </div>
          <div className="hidden">
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-medium text-emerald-800">Interview Complete</p>
          <button
            type="button"
            onClick={() => void handleGetResults()}
            disabled={isScoring}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            {isScoring ? "Calculating..." : "Get Results"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-400">
        Session: {sessionId} | Questions: {setupResponse.questions_count}
      </p>
    </div>
  );
}
