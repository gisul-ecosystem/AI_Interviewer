"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  sessionId: string;
};

function scoreColor(score: number): string {
  if (score <= 2) return "text-red-700 bg-red-50 border-red-200";
  if (score === 3) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-200";
}

type ScoreData = {
  score: number;
  justification: string;
  key_points_covered: string[];
  missing_points: string[];
};

export default function ResultsPanel({ sessionId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scores, setScores] = useState<Record<string, ScoreData>>({});

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("http://localhost:8000/api/interview/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail || "Failed to score interview");
        }
        setScores(data.scores || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to score interview");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [sessionId]);

  const entries = useMemo(() => Object.entries(scores), [scores]);
  const totalScore = entries.reduce((sum, [, data]) => sum + (data.score || 0), 0);
  const totalPossible = entries.length * 5;
  const overall = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Scoring interview, please wait...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-xl font-semibold text-blue-900">Interview Results</h2>
        <p className="mt-3 text-3xl font-bold text-blue-900">{overall}%</p>
        <p className="text-sm text-blue-700">
          Overall score ({totalScore}/{totalPossible})
        </p>
      </div>

      <div className="grid gap-4">
        {entries.map(([questionId, data]) => {
          const questionText = `Question ${questionId}`;
          return (
            <div
              key={questionId}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-sm font-semibold text-slate-800">{questionText}</p>
              <p
                className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-medium ${scoreColor(
                  data.score
                )}`}
              >
                Score: {data.score}/5
              </p>
              <p className="mt-3 text-sm text-slate-700">{data.justification}</p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-emerald-700">
                    Key points covered
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {data.key_points_covered.map((point, idx) => (
                      <li key={idx}>- [OK] {point}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-red-700">Missing points</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {data.missing_points.map((point, idx) => (
                      <li key={idx}>- [X] {point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
      >
        Start New Interview
      </button>
    </div>
  );
}
