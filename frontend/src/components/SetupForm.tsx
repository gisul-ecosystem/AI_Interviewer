"use client";

import { useEffect, useState } from "react";

import { setupInterview } from "@/lib/api";
import type { InterviewConfig, SetupResponse } from "@/types/interview";

type Props = {
  onSetupComplete: (response: SetupResponse, config: InterviewConfig) => void;
};

const fieldClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-black placeholder:text-black outline-none ring-blue-200 focus:ring";

const initialConfig: InterviewConfig = {
  role: "",
  jd: "",
  experience_min: 2,
  experience_max: 5,
  domain: "",
  interview_type: "technical",
  difficulty: "medium",
  num_questions: 8,
  candidate_name: "",
};

export default function SetupForm({ onSetupComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<InterviewConfig>(initialConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateField = <K extends keyof InterviewConfig>(
    key: K,
    value: InterviewConfig[K]
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await setupInterview(config);
      onSetupComplete(response, config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup interview");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Interview Setup</h1>
      <p className="mt-1 text-sm text-slate-600">
        Configure interview details to generate a tailored question set.
      </p>
      {!mounted ? (
        <div className="mt-6 space-y-4" aria-hidden="true">
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-11 animate-pulse rounded-lg bg-slate-200" />
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Role
          </label>
          <input
            required
            className={fieldClassName}
            value={config.role}
            onChange={(e) => updateField("role", e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Job Description
          </label>
          <textarea
            required
            rows={4}
            className={fieldClassName}
            value={config.jd}
            onChange={(e) => updateField("jd", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Experience Min (years)
            </label>
            <input
              type="number"
              min={0}
              required
              className={fieldClassName}
              value={config.experience_min}
              onChange={(e) =>
                updateField("experience_min", Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Experience Max (years)
            </label>
            <input
              type="number"
              min={0}
              required
              className={fieldClassName}
              value={config.experience_max}
              onChange={(e) =>
                updateField("experience_max", Number(e.target.value))
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Domain
          </label>
          <input
            required
            className={fieldClassName}
            value={config.domain}
            onChange={(e) => updateField("domain", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Interview Type
            </label>
            <select
              className={fieldClassName}
              value={config.interview_type}
              onChange={(e) =>
                updateField(
                  "interview_type",
                  e.target.value as InterviewConfig["interview_type"]
                )
              }
            >
              <option value="technical">Technical</option>
              <option value="behavioural">Behavioural</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Difficulty
            </label>
            <select
              className={fieldClassName}
              value={config.difficulty}
              onChange={(e) =>
                updateField(
                  "difficulty",
                  e.target.value as InterviewConfig["difficulty"]
                )
              }
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Number of Questions
          </label>
          <input
            type="number"
            min={4}
            max={20}
            required
            className={fieldClassName}
            value={config.num_questions}
            onChange={(e) => updateField("num_questions", Number(e.target.value))}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Candidate Name
          </label>
          <input
            required
            className={fieldClassName}
            value={config.candidate_name}
            onChange={(e) => updateField("candidate_name", e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {isLoading ? "Starting..." : "Start Interview"}
        </button>
      </form>
      )}
    </div>
  );
}
