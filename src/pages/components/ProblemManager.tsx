import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
  adminApi,
  type AdminProblem,
  type AdminProblemSummary,
  type AdminProblemType,
  type ProblemTestCase,
  type UpsertProblemPayload,
} from "@/services/api/adminApi";

interface ProblemFormData {
  title: string;
  description: string;
  points: number;
  type: AdminProblemType;
  options: string[];
  correctAnswer: number;
  testcases: ProblemTestCase[];
}

interface ProblemManagerProps {
  contestId: string;
  problems: AdminProblemSummary[];
  onProblemSaved: (problem: AdminProblemSummary) => void;
  onProblemDeleted: (problemId: string) => void;
}

const emptyTestCase = (): ProblemTestCase => ({ input: "", expected_output: "" });

const initialFormData = (): ProblemFormData => ({
  title: "",
  description: "",
  points: 100,
  type: "code",
  options: ["", "", "", ""],
  correctAnswer: 0,
  testcases: [emptyTestCase()],
});

const unpackDescription = (description: string): string => {
  try {
    const parsed: unknown = JSON.parse(description);
    if (typeof parsed === "object" && parsed !== null) {
      const value = (parsed as Record<string, unknown>).description;
      if (typeof value === "string") return value;
    }
  } catch {
    // Older problems may already store the description as plain text.
  }
  return description;
};

const formDataFromProblem = (problem: AdminProblem): ProblemFormData => ({
  title: problem.name,
  description: unpackDescription(problem.description),
  points: problem.score,
  type: problem.type,
  options: problem.options.length > 0 ? problem.options : ["", "", "", ""],
  correctAnswer: problem.answer[0] ?? 0,
  testcases: problem.testcases.length > 0 ? problem.testcases : [emptyTestCase()],
});

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const responseData: unknown = error.response?.data;
    if (typeof responseData === "object" && responseData !== null) {
      const data = responseData as Record<string, unknown>;
      if (typeof data.error === "string") return data.error;
      if (typeof data.message === "string") return data.message;
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const ProblemManager: React.FC<ProblemManagerProps> = ({
  contestId,
  problems,
  onProblemSaved,
  onProblemDeleted,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [loadingProblemId, setLoadingProblemId] = useState<string | null>(null);
  const [deletingProblemId, setDeletingProblemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState<ProblemFormData>(initialFormData);

  const resetForm = () => {
    setFormData(initialFormData());
    setEditingProblemId(null);
    setFormError("");
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    setFormData(initialFormData());
    setEditingProblemId(null);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: name === "points" ? Number(value) : value,
    }));
  };

  const handleOptionChange = (index: number, value: string) => {
    setFormData((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (
        optionIndex === index ? value : option
      )),
    }));
  };

  const handleTestCaseChange = (
    index: number,
    field: keyof ProblemTestCase,
    value: string,
  ) => {
    setFormData((current) => ({
      ...current,
      testcases: current.testcases.map((testcase, testcaseIndex) => (
        testcaseIndex === index ? { ...testcase, [field]: value } : testcase
      )),
    }));
  };

  const addTestCase = () => {
    setFormData((current) => ({
      ...current,
      testcases: [...current.testcases, emptyTestCase()],
    }));
  };

  const removeTestCase = (index: number) => {
    setFormData((current) => ({
      ...current,
      testcases: current.testcases.filter((_, testcaseIndex) => testcaseIndex !== index),
    }));
  };

  const handleTypeChange = (type: AdminProblemType) => {
    setFormData((current) => ({
      ...current,
      type,
      options: current.options.length > 0 ? current.options : ["", "", "", ""],
      testcases: current.testcases.length > 0 ? current.testcases : [emptyTestCase()],
    }));
  };

  const handleEdit = async (problem: AdminProblemSummary) => {
    setLoadingProblemId(problem.id);
    try {
      const details = await adminApi.getProblemById(contestId, problem.id);
      setFormData(formDataFromProblem(details));
      setEditingProblemId(problem.id);
      setFormError("");
      setIsModalOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load the problem."));
    } finally {
      setLoadingProblemId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (formData.type === "code" && formData.testcases.length === 0) {
      setFormError("Add at least one testcase for a coding problem.");
      return;
    }

    const basePayload = {
      name: formData.title.trim(),
      description: formData.description,
      score: formData.points,
    };
    const payload: UpsertProblemPayload = formData.type === "code"
      ? {
          ...basePayload,
          type: "code",
          testcases: formData.testcases,
        }
      : {
          ...basePayload,
          type: "mcq",
          answer: [formData.correctAnswer],
          options: formData.options,
        };

    setIsSaving(true);
    try {
      const savedProblem = editingProblemId
        ? await adminApi.updateProblem(contestId, editingProblemId, payload)
        : await adminApi.createProblem(contestId, payload);

      if (!savedProblem.id) {
        throw new Error("The backend did not return a problem ID.");
      }

      onProblemSaved({
        id: savedProblem.id,
        name: payload.name,
        score: payload.score,
        type: payload.type,
      });
      toast.success(editingProblemId ? "Problem updated." : "Problem created.");
      resetForm();
    } catch (error) {
      setFormError(getErrorMessage(error, "Failed to save the problem."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (problem: AdminProblemSummary) => {
    if (!window.confirm(`Delete “${problem.name}”? This cannot be undone.`)) return;

    setDeletingProblemId(problem.id);
    try {
      await adminApi.deleteProblem(contestId, problem.id);
      onProblemDeleted(problem.id);
      toast.success("Problem deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete the problem."));
    } finally {
      setDeletingProblemId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-gradient-to-r from-green-600 to-green-500 px-6 py-3 font-semibold text-black transition-all duration-200 hover:from-green-700 hover:to-green-600"
        >
          + Add Problem
        </button>
      </div>

      <div className="grid gap-4">
        {problems.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-800 py-12 text-center">
            <p className="text-gray-400">No problems created for this contest yet.</p>
          </div>
        ) : (
          problems.map((problem) => (
            <div
              key={problem.id}
              className="rounded-lg border border-gray-700 bg-gray-800 p-6 transition-all duration-200 hover:border-green-500"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-grow">
                  <div className="mb-3 flex flex-wrap items-center gap-4">
                    <h4 className="text-xl font-bold text-green-400">{problem.name}</h4>
                    <span className="text-sm text-green-400">{problem.score} points</span>
                    <span className={`rounded border px-2 py-1 text-xs font-semibold ${
                      problem.type === "code"
                        ? "border-blue-700 bg-blue-900 text-blue-300"
                        : "border-purple-700 bg-purple-900 text-purple-300"
                    }`}>
                      {problem.type === "code" ? "CODE" : "MCQ"}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Problem ID:</span>
                    <span className="ml-2 break-all text-gray-300">{problem.id}</span>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 md:ml-4 md:w-auto">
                  <button
                    type="button"
                    onClick={() => void handleEdit(problem)}
                    disabled={loadingProblemId === problem.id || deletingProblemId === problem.id}
                    className="w-full rounded bg-gray-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingProblemId === problem.id ? "Loading..." : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(problem)}
                    disabled={deletingProblemId === problem.id || loadingProblemId === problem.id}
                    className="w-full rounded bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingProblemId === problem.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-green-500 bg-gray-900 p-4 sm:p-8">
            <h3 className="mb-2 text-2xl font-bold text-green-400">
              {editingProblemId ? "Edit Problem" : "Create New Problem"}
            </h3>
            {editingProblemId && (
              <p className="mb-6 break-all text-sm text-gray-500">ID: {editingProblemId}</p>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-gray-400">Problem Type</label>
                <select
                  value={formData.type}
                  onChange={(event) => handleTypeChange(event.target.value as AdminProblemType)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
                  required
                >
                  <option value="code">Code Problem</option>
                  <option value="mcq">MCQ</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-gray-400">Problem Title</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-gray-400">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={6}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
                  required
                />
              </div>

              {formData.type === "mcq" && (
                <>
                  <div className="space-y-3">
                    <label className="mb-2 block text-gray-400">Options</label>
                    {formData.options.map((option, index) => (
                      <div key={index}>
                        <label className="mb-1 block text-sm text-gray-500">
                          Option {index + 1}
                        </label>
                        <input
                          type="text"
                          value={option}
                          onChange={(event) => handleOptionChange(index, event.target.value)}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
                          required
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="mb-2 block text-gray-400">Correct Answer</label>
                    <select
                      value={formData.correctAnswer}
                      onChange={(event) => setFormData((current) => ({
                        ...current,
                        correctAnswer: Number(event.target.value),
                      }))}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
                      required
                    >
                      {formData.options.map((_, index) => (
                        <option key={index} value={index}>Option {index + 1}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {formData.type === "code" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-gray-300">Testcases</h4>
                      <p className="text-sm text-gray-500">
                        Each coding problem requires an input and expected output pair.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addTestCase}
                      className="rounded bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-600"
                    >
                      + Add Testcase
                    </button>
                  </div>

                  {formData.testcases.map((testcase, index) => (
                    <fieldset
                      key={index}
                      className="space-y-3 rounded-lg border border-gray-700 bg-gray-800/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <legend className="font-semibold text-gray-300">Testcase {index + 1}</legend>
                        <button
                          type="button"
                          onClick={() => removeTestCase(index)}
                          disabled={formData.testcases.length === 1}
                          className="text-sm font-semibold text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-gray-400">Input</label>
                          <textarea
                            value={testcase.input}
                            onChange={(event) => handleTestCaseChange(index, "input", event.target.value)}
                            rows={4}
                            className="w-full rounded border border-gray-700 bg-gray-900 px-4 py-2 font-mono text-sm text-gray-300 focus:border-green-500 focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-gray-400">Expected Output</label>
                          <textarea
                            value={testcase.expected_output}
                            onChange={(event) => handleTestCaseChange(index, "expected_output", event.target.value)}
                            rows={4}
                            className="w-full rounded border border-gray-700 bg-gray-900 px-4 py-2 font-mono text-sm text-gray-300 focus:border-green-500 focus:outline-none"
                            required
                          />
                        </div>
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}

              <div className="max-w-xs">
                <label className="mb-2 block text-gray-400">Points</label>
                <input
                  type="number"
                  name="points"
                  value={formData.points}
                  onChange={handleInputChange}
                  min="1"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 focus:border-green-500 focus:outline-none"
                  required
                />
              </div>

              {formError && (
                <p role="alert" className="rounded border border-red-800 bg-red-950/50 p-3 text-red-300">
                  {formError}
                </p>
              )}

              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 rounded-lg bg-gradient-to-r from-green-600 to-green-500 px-6 py-3 font-semibold text-black transition-all duration-200 hover:from-green-700 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Saving..."
                    : editingProblemId ? "Update Problem" : "Create Problem"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="flex-1 rounded-lg bg-gray-800 px-6 py-3 font-semibold text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProblemManager;
