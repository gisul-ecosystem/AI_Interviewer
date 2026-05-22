"use client";

import { useEffect, useRef } from "react";

import type { Turn } from "@/types/interview";

type Props = {
  turns: Turn[];
  candidateName?: string;
};

export default function ChatWindow({ turns, candidateName = "Candidate" }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  return (
    <div className="h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="space-y-4">
        {turns.map((turn, index) => {
          const isInterviewer = turn.role === "interviewer";
          const label = isInterviewer ? "Alex" : candidateName;
          return (
            <div
              key={`${turn.role}-${index}`}
              className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}
            >
              <div className="max-w-[85%]">
                <p
                  className={`mb-1 text-xs font-medium ${
                    isInterviewer
                      ? "text-left text-slate-600"
                      : "text-right text-blue-700"
                  }`}
                >
                  {label}
                </p>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isInterviewer
                      ? "bg-slate-200 text-slate-900"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  {turn.text}
                </div>
                <p
                  className={`mt-1 text-xs ${
                    isInterviewer
                      ? "text-left text-slate-500"
                      : "text-right text-blue-700/80"
                  }`}
                >
                  {new Date(turn.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={endRef} />
    </div>
  );
}
