import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../lib/AuthContext";
import { updateUserProfile, updateUserPassword, type UserProfile } from "../lib/profileService";
import { motion } from "framer-motion";
import { Popup } from "../components/ui/popup";
import { useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";

import { BRANCHES } from "@/constants";

export const Profile: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Partial<UserProfile>>({});
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: "success" | "error";
    message: string;
  }>({
    isOpen: false,
    type: "error",
    message: "",
  });

  useEffect(() => {
    if (userProfile) {
      setFormData(userProfile);
    }
  }, [userProfile]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowBranchDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePasswordChange = async () => {
    if (!passwordData.new || passwordData.new.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setPasswordLoading(true);
    setError("");

    try {
      await updateUserPassword(passwordData.current, passwordData.new);
      setPasswordData({ current: "", new: "", confirm: "" });
      setPopup({
        isOpen: true,
        type: "success",
        message: "Password changed successfully!",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to change password";
      setError(errorMessage);
      setPopup({
        isOpen: true,
        type: "error",
        message: errorMessage,
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleBranchSelect = async (branch: string) => {
    setFormData(prev => ({ ...prev, branch }));
    setShowBranchDropdown(false);
    if (user) {
      setProfileLoading(true);
      try {
        // The backend requires name and mobile alongside department.
        await updateUserProfile(user.uid, { ...userProfile, branch });
        await refreshProfile();
        setPopup({
          isOpen: true,
          type: "success",
          message: "Branch updated successfully!",
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update branch";
        setFormData(prev => ({ ...prev, branch: userProfile?.branch }));
        setPopup({
          isOpen: true,
          type: "error",
          message: errorMessage,
        });
      } finally {
        setProfileLoading(false);
      }
    }
  };

  const closePopup = () => setPopup(prev => ({ ...prev, isOpen: false }));

  if (!user || !userProfile) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-dm-sans">
      <Navbar />

      <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl"
        >
          <div className="border border-white rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-medium font-anton tracking-wider text-white mb-2">
                Profile Settings
              </h2>
              <p className="text-gray-400">Manage your account information</p>
            </div>

            {/* Account Information */}
            <div className="space-y-6">
              {/* Name & Year of Study */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300">
                    Full Name:
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name || ""}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-800 border border-white rounded-lg text-white cursor-not-allowed"
                  />
                </div>

                {/* Year of Study */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Year of Study:</label>
                  <input
                    type="text"
                    value={formData.joiningYear || ""}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-800 border border-white rounded-lg text-white cursor-not-allowed"
                  />
                </div>
              </div>

              {/* USN */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">USN:</label>
                <input
                  type="text"
                  value={formData.id || ""}
                  readOnly
                  className="w-full px-4 py-3 bg-gray-800 border border-white rounded-lg text-white cursor-not-allowed"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Email:</label>
                <input
                  type="email"
                  value={formData.email || ""}
                  readOnly
                  className="w-full px-4 py-3 bg-gray-800 border border-white rounded-lg text-white cursor-not-allowed"
                />
              </div>

              {/* Branch Dropdown */}
              <div className="space-y-2" ref={dropdownRef}>
                <label className="block text-sm font-medium text-gray-300">Branch:</label>
                <div className="relative">
                  <div
                    className={`w-full px-4 py-3 bg-gray-800 border border-white rounded-lg text-white flex items-center justify-between transition-colors ${
                      profileLoading ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-750"
                    }`}
                    onClick={() => !profileLoading && setShowBranchDropdown(!showBranchDropdown)}
                  >
                    <span>{profileLoading ? "Updating branch..." : (formData.branch || "Select Branch")}</span>
                    <svg
                      className={`w-5 h-5 transition-transform ${
                        showBranchDropdown ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                  {showBranchDropdown && (
                    <div className="absolute z-10 w-full mt-2 bg-gray-800 border border-white rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {BRANCHES.map((branch) => (
                        <div
                          key={branch}
                          className="px-4 py-3 text-white hover:bg-gray-700 cursor-pointer transition-colors"
                          onClick={() => handleBranchSelect(branch)}
                        >
                          {branch}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Change Password */}
              <div className="pt-6 border-t border-gray-700">
                <h3 className="text-xl font-semibold text-white mb-6">Change Password</h3>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Old Password:
                    </label>
                    <input
                      type="password"
                      value={passwordData.current}
                      onChange={(e) =>
                        setPasswordData({ ...passwordData, current: e.target.value })
                      }
                      placeholder="Enter old password"
                      className="w-full px-4 py-3 bg-black border border-white rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      New Password:
                    </label>
                    <input
                      type="password"
                      value={passwordData.new}
                      onChange={(e) =>
                        setPasswordData({ ...passwordData, new: e.target.value })
                      }
                      placeholder="Enter new password"
                      className="w-full px-4 py-3 bg-black border border-white rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>

                  {error && <p className="text-red-500 text-sm">{error}</p>}

                  <button
                    type="button"
                    onClick={handlePasswordChange}
                    disabled={passwordLoading}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {passwordLoading ? "Updating Password..." : "Update Password"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <Footer />

      <Popup
        isOpen={popup.isOpen}
        onClose={closePopup}
        type={popup.type}
        message={popup.message}
        autoCloseDelay={popup.type === "success" ? 2000 : 5000}
      />
    </div>
  );
};
