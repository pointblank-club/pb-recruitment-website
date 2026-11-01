import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { Contest } from "@/models/contest";
import { adminApi } from "@/services/api/adminApi";
import { toast } from "react-toastify";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";

// Simple markdown renderer for preview
const renderMarkdown = (markdown: string): string => {
  if (!markdown) return "";
  
  const html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-green-400 mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-green-400 mt-5 mb-3">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-green-400 mt-6 mb-4">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-200">$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em class="italic text-gray-300">$1</em>')
    // Code blocks
    .replace(/```(.*?)```/gs, '<pre class="bg-gray-800 p-3 rounded my-2 overflow-x-auto"><code class="text-green-300">$1</code></pre>')
    // Inline code
    .replace(/`(.*?)`/g, '<code class="bg-gray-800 px-2 py-1 rounded text-green-300">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-green-400 hover:text-green-300 underline" target="_blank" rel="noopener noreferrer">$1</a>')
    // Unordered lists
    .replace(/^\* (.+)$/gim, '<li class="ml-4">$1</li>')
    .replace(/(<li class="ml-4">.*<\/li>)/s, '<ul class="list-disc list-inside my-2 text-gray-300">$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  
  return html;
};

const getSaveErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === "object" && data !== null) {
      const body = data as Record<string, unknown>;
      if (typeof body.error === "string" && body.error.trim()) return body.error;
      if (typeof body.message === "string" && body.message.trim()) return body.message;
      if (Array.isArray(body.errors)) {
        const messages = body.errors.flatMap((item) => {
          if (typeof item !== "object" || item === null) return [];
          const validation = item as Record<string, unknown>;
          return typeof validation.message === "string"
            ? [typeof validation.field === "string" ? `${validation.field}: ${validation.message}` : validation.message]
            : [];
        });
        if (messages.length) return messages.join("; ");
      }
    }
  }
  return "Failed to save contest. Please try again.";
};

const AddContest: React.FC = () => {
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId?: string }>();
  const isEditMode = !!contestId;

  const [isLoading, setIsLoading] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [eligibility, setEligibility] = useState({
    firstYear: false,
    secondYear: false,
    thirdYear: false,
  });
  const [formData, setFormData] = useState<Contest>(
    new Contest({
      id: "",
      name: "",
      description: "",
      registration_start_time: 0,
      registration_end_time: 0,
      start_time: 0,
      end_time: 0,
      eligible_to: [],
    })
  );

  useEffect(() => {
    if (isEditMode && contestId) {
      const fetchContest = async () => {
        try {
          setIsLoading(true);
          const contest = await adminApi.getContestById(contestId);
          if (contest) {
            setFormData(contest);
            // Parse eligible_to string to set checkboxes
            setEligibility({
              firstYear: contest.eligible_to.includes(1),
              secondYear: contest.eligible_to.includes(2),
              thirdYear: contest.eligible_to.includes(3),
            });
          } else {
            toast.error("Contest not found");
            navigate("/admin");
          }
        } catch (error) {
          console.error("Error fetching contest:", error);
          toast.error("Error loading contest");
          navigate("/admin");
        } finally {
          setIsLoading(false);
        }
      };
      fetchContest();
    }
  }, [contestId, isEditMode, navigate]);

  const dateToTimestamp = (dateString: string): number => {
    return new Date(dateString).getTime();
  };

  const timestampToDateInput = (timestamp: number): string => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    // Get local time components and format for datetime-local
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) =>
      new Contest({
        ...prev,
        [name]: value,
      })
    );
  };

  const handleEligibilityChange = (year: 1 | 2 | 3) => {
    const yearKey = year === 1 ? 'firstYear' : year === 2 ? 'secondYear' : 'thirdYear';
    const newEligibility = {
      ...eligibility,
      [yearKey]: !eligibility[yearKey],
    };
    setEligibility(newEligibility);
    
    // Update eligible_to array
    const eligibleYears: number[] = [];
    if (newEligibility.firstYear) eligibleYears.push(1);
    if (newEligibility.secondYear) eligibleYears.push(2);
    if (newEligibility.thirdYear) eligibleYears.push(3);
    
    setFormData((prev) =>
      new Contest({
        ...prev,
        eligible_to: eligibleYears,
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate at least one eligibility checkbox is selected
    if (!eligibility.firstYear && !eligibility.secondYear && !eligibility.thirdYear) {
      toast.error("Please select at least one year for eligibility");
      return;
    }
    
    try {
      setIsLoading(true);
      if (isEditMode) {
        await adminApi.updateContest(formData);
        toast.success("Contest updated successfully!");
      } else {
        await adminApi.createContest(formData);
        toast.success("Contest created successfully!");
      }
      navigate("/admin");
    } catch (error: unknown) {
      console.error("Error saving contest:", error);
      toast.error(getSaveErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/admin");
  };

  if (isLoading && isEditMode) {
    return (
      <div className="bg-black text-gray-300 min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <p className="text-gray-400">Loading contest...</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-black text-gray-300 min-h-screen flex flex-col">
      <Navbar />
      
      <div className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-green-400 mb-2">
              {isEditMode ? "Edit Contest" : "Create New Contest"}
            </h1>
            <p className="text-gray-400">
              {isEditMode
                ? "Update the contest details below"
                : "Fill in the details to create a new contest"}
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-gray-400 mb-2 font-semibold">
                  Contest Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="First Year Recruitment Contest"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 focus:border-green-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-gray-400 font-semibold">
                    Description
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                    className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded transition-colors"
                  >
                    {showMarkdownPreview ? "Edit" : "Preview"}
                  </button>
                </div>
                {showMarkdownPreview ? (
                  <div 
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 min-h-[120px]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(formData.description) }}
                  />
                ) : (
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter contest description with markdown support (optional)&#10;&#10;**Bold text**, *italic*, `code`, [link](url)&#10;# Header, ## Subheader&#10;* List item"
                    rows={8}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 focus:border-green-500 focus:outline-none resize-none font-mono"
                  />
                )}
                <p className="text-gray-500 text-sm mt-1">
                  Supports markdown: **bold**, *italic*, `code`, [links](url), # headers, * lists
                </p>
              </div>

              <div>
                <label className="block text-gray-400 mb-2 font-semibold">
                  Eligible To *
                </label>
                <div className="space-y-3 bg-gray-800 border border-gray-700 rounded px-4 py-4">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={eligibility.firstYear}
                      onChange={() => handleEligibilityChange(1)}
                      className="w-5 h-5 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500 focus:ring-2 cursor-pointer"
                    />
                    <span className="ml-3 text-gray-300 group-hover:text-green-400 transition-colors">
                      1st Year
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={eligibility.secondYear}
                      onChange={() => handleEligibilityChange(2)}
                      className="w-5 h-5 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500 focus:ring-2 cursor-pointer"
                    />
                    <span className="ml-3 text-gray-300 group-hover:text-green-400 transition-colors">
                      2nd Year
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={eligibility.thirdYear}
                      onChange={() => handleEligibilityChange(3)}
                      className="w-5 h-5 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500 focus:ring-2 cursor-pointer"
                    />
                    <span className="ml-3 text-gray-300 group-hover:text-green-400 transition-colors">
                      3rd Year
                    </span>
                  </label>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  Select which years can participate in this contest
                </p>
              </div>

              <div className="border-t border-gray-800 pt-6">
                <h3 className="text-xl font-bold text-green-400 mb-4">
                  Registration Period
                </h3>
                <p className="text-gray-500 text-sm mb-4">
                  All times are in IST (Indian Standard Time)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-gray-400 mb-2 font-semibold">
                      Registration Start Time (IST) *
                    </label>
                    <input
                      type="datetime-local"
                      value={timestampToDateInput(formData.registration_start_time)}
                      onChange={(e) =>
                        setFormData((prev) =>
                          new Contest({
                            ...prev,
                            registration_start_time: dateToTimestamp(e.target.value),
                          })
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 focus:border-green-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-2 font-semibold">
                      Registration End Time (IST) *
                    </label>
                    <input
                      type="datetime-local"
                      value={timestampToDateInput(formData.registration_end_time)}
                      onChange={(e) =>
                        setFormData((prev) =>
                          new Contest({
                            ...prev,
                            registration_end_time: dateToTimestamp(e.target.value),
                          })
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 focus:border-green-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-6">
                <h3 className="text-xl font-bold text-green-400 mb-4">
                  Contest Period
                </h3>
                <p className="text-gray-500 text-sm mb-4">
                  All times are in IST (Indian Standard Time)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-gray-400 mb-2 font-semibold">
                      Contest Start Time (IST) *
                    </label>
                    <input
                      type="datetime-local"
                      value={timestampToDateInput(formData.start_time)}
                      onChange={(e) =>
                        setFormData((prev) =>
                          new Contest({
                            ...prev,
                            start_time: dateToTimestamp(e.target.value),
                          })
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 focus:border-green-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-2 font-semibold">
                      Contest End Time (IST) *
                    </label>
                    <input
                      type="datetime-local"
                      value={timestampToDateInput(formData.end_time)}
                      onChange={(e) =>
                        setFormData((prev) =>
                          new Contest({
                            ...prev,
                            end_time: dateToTimestamp(e.target.value),
                          })
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-gray-300 focus:border-green-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-800">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading
                    ? "Saving..."
                    : isEditMode
                    ? "Update Contest"
                    : "Create Contest"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AddContest;
