import React, { useState, useEffect, useRef } from "react";
import { signUpUser, type SignUpData } from "../lib/auth";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import { motion } from "framer-motion";
import { Popup } from "../components/ui/popup";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { auth } from "../lib/firebase";

import { BRANCHES, getDepartmentFromBranch } from "@/constants";

export const Signup: React.FC = () => {
  const [formData, setFormData] = useState<Omit<SignUpData, 'joiningYear'> & { confirmPassword: string; joiningYear: number | "" }>({
    name: "",
    id: "",
    email: "",
    mobile: "",
    joiningYear: "" as number | "",
    branch: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const idValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: "success" | "error";
    message: string;
  }>({
    isOpen: false,
    type: "error",
    message: "",
  });

  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    id?: string;
    mobile?: string;
    branch?: string;
  }>({});

  const navigate = useNavigate();

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const updatedData: any = { ...formData, [name]: value };
    
    if (name === 'joiningYear') {
      updatedData[name] = value ? parseInt(value, 10) : "";
      setErrors(prev => ({ ...prev, id: undefined }));
    }
    
    setFormData(updatedData);

    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleBranchSelect = (branch: string) => {
    setFormData({ ...formData, branch });
    setShowBranchDropdown(false);
    setErrors(prev => ({ ...prev, branch: undefined }));
  };

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validateMobile = (mobile: string) => /^\d{10}$/.test(mobile);
  const validateUSN = (usn: string) => /^1DS2[1-6](AI|AE|AU|BT|CG|MD|ET|EC|ME|EE|CH|CB|IC|CD|CS|CV|IS|RI|EI|CY)[0-9]{3}$/i.test(usn.trim());
  const validateAppNumber = (appNo: string) => /^26UGDS[0-9]{4}$/i.test(appNo.trim());
  const validatePassword = (password: string) => /^.{6,}$/.test(password);

  const isFirstYear = formData.joiningYear === 1;

  const validateIdentifier = (id: string, firstYear: boolean, branch?: string): string | undefined => {
    const trimmed = id.trim();
    if (!trimmed) return undefined;
    if (firstYear) {
      if (!validateAppNumber(trimmed)) {
        return "First-year students must provide a valid Application Number (e.g., 26UGDS1234)";
      }
    } else {
      if (!validateUSN(trimmed)) {
        return "Provide a valid USN (e.g., 1DS24IC015)";
      }
      if (branch) {
        const expectedDept = getDepartmentFromBranch(branch);
        const usnDept = trimmed.substring(5, 7).toUpperCase();
        if (expectedDept && usnDept !== expectedDept) {
          return `USN does not match the selected branch (${expectedDept})`;
        }
      }
    }
    return undefined;
  };

  const checkEmailExists = async (email: string) => {
    email = email.trim().toLowerCase();
    if (!validateEmail(email)) return false;
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      return methods.length > 0;
    } catch (error) {
      console.error("Error checking email:", error);
      return false;
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.mobile && !validateMobile(formData.mobile)) {
        setErrors(prev => ({ ...prev, mobile: "Mobile number must be 10 digits" }));
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.mobile]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.password && !validatePassword(formData.password)) {
        setErrors(prev => ({ ...prev, password: "Password must be at least 6 characters" }));
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.password]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
        setErrors(prev => ({ ...prev, confirmPassword: "Passwords do not match" }));
      } else {
        setErrors(prev => ({ ...prev, confirmPassword: undefined }));
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.password, formData.confirmPassword]);

  useEffect(() => {
    if (idValidationTimeoutRef.current) clearTimeout(idValidationTimeoutRef.current);

    if (!formData.id) {
      setErrors(prev => ({ ...prev, id: undefined }));
      return;
    }

    idValidationTimeoutRef.current = setTimeout(() => {
      const err = validateIdentifier(formData.id, isFirstYear, formData.branch);
      setErrors(prev => ({ ...prev, id: err }));
    }, 500);

    return () => {
      if (idValidationTimeoutRef.current) clearTimeout(idValidationTimeoutRef.current);
    };
  }, [formData.id, formData.branch, isFirstYear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (idValidationTimeoutRef.current) {
      clearTimeout(idValidationTimeoutRef.current);
      idValidationTimeoutRef.current = null;
    }

    const newErrors: typeof errors = {};

    if (!validateEmail(formData.email)) newErrors.email = "Enter a valid email (example: xxx@xxx.com)";
    if (!validateMobile(formData.mobile)) newErrors.mobile = "Mobile number must be 10 digits";
    if (!formData.branch) newErrors.branch = "Please select your branch";
    const idError = validateIdentifier(formData.id, isFirstYear, formData.branch);
    if (!formData.id.trim()) {
      newErrors.id = isFirstYear
        ? "First-year students must provide a valid Application Number (e.g., 26UGDS1234)"
        : "Provide a valid USN (e.g., 1DS24IC015)";
    } else if (idError) {
      newErrors.id = idError;
    }
    if (!validatePassword(formData.password)) {
      newErrors.password = "Password must be at least 6 characters";
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      if (await checkEmailExists(formData.email)) {
        setErrors(prev => ({ ...prev, email: "Email already exists" }));
        return;
      }

      await signUpUser({ ...formData, joiningYear: formData.joiningYear as number });
      
      setPopup({
        isOpen: true,
        type: "success",
        message: "Account created! Redirecting...",
      });

      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      let message = "Signup failed. Please try again.";

      const resData = err?.response?.data;
      if (resData?.errors && Array.isArray(resData.errors)) {
        const fieldMap: Record<string, keyof typeof errors> = {
          usn: 'id',
          mobile_number: 'mobile',
          email: 'email',
          password: 'password',
        };
        const newErr: typeof errors = {};
        for (const item of resData.errors) {
          const mappedField = fieldMap[item.field] || (item.field as keyof typeof errors);
          if (mappedField && typeof item.message === 'string') {
            newErr[mappedField] = item.message;
            message = item.message;
          }
        }
        if (Object.keys(newErr).length > 0) {
          setErrors(prev => ({ ...prev, ...newErr }));
        }
      } else if (resData?.field && typeof resData?.error === "string") {
        const field = resData.field as keyof typeof errors;
        setErrors(prev => ({ ...prev, [field]: resData.error }));
        message = resData.error;
      } else if (typeof resData?.error === "string") {
        message = resData.error;
      } else if (typeof resData?.message === "string") {
        message = resData.message;
      } else if (err?.code) {
        switch (err.code) {
          case "auth/email-already-in-use":
            message = "Email already exists";
            setErrors(prev => ({ ...prev, email: message }));
            break;
          case "auth/invalid-email":
            message = "Invalid email";
            setErrors(prev => ({ ...prev, email: message }));
            break;
          case "auth/weak-password":
            message = "Password too weak";
            setErrors(prev => ({ ...prev, password: message }));
            break;
          default:
            message = "Signup failed. Please try again.";
        }
      }

      setPopup({
        isOpen: true,
        type: "error",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const closePopup = () => setPopup(prev => ({ ...prev, isOpen: false }));

  return (
    <div className="min-h-screen bg-black text-white font-dm-sans">
      <Navbar />
      <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-2xl">
          <div className="border border-white rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-medium font-anton tracking-wider text-white mb-2">Create Account</h2>
              <p className="text-gray-400">Join us and start your journey</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset disabled={loading} className="space-y-6 disabled:opacity-70">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300">Full Name:</label>
                    <input id="name" name="name" value={formData.name} onChange={handleChange} required placeholder="Enter your full name"
                      className="w-full px-4 py-3 border border-white rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-transparent" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="joiningYear" className="block text-sm font-medium text-gray-300">Year of Study:</label>
                    <select id="joiningYear" name="joiningYear" value={formData.joiningYear || ""} onChange={handleChange} required
                      className="w-full px-4 py-3 bg-black border border-white rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 cursor-pointer">
                      <option value="">Select Year of Study</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="id" className="block text-sm font-medium text-gray-300">{isFirstYear ? "Application Number:" : "USN:"}</label>
                  {errors.id && <p className="text-red-500 text-sm font-dm-sans">{errors.id}</p>}
                  <input id="id" name="id" value={formData.id} onChange={handleChange} required
                    placeholder={isFirstYear ? "Enter application number (e.g., 26UGDS1234)" : "Enter USN (e.g., 1DS24CS000)"}
                    className={`w-full px-4 py-3 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-transparent ${errors.id ? 'border-red-500' : 'border-white'}`} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email:</label>
                    <input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required placeholder="Enter your email"
                      className={`w-full px-4 py-3 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-transparent ${errors.email ? 'border-red-500' : 'border-white'}`} />
                    {errors.email && <p className="text-red-500 text-sm font-dm-sans">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="mobile" className="block text-sm font-medium text-gray-300">Mobile Number:</label>
                    <input id="mobile" name="mobile" type="tel" value={formData.mobile} onChange={handleChange} required placeholder="Enter mobile number"
                      className={`w-full px-4 py-3 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-transparent ${errors.mobile ? 'border-red-500' : 'border-white'}`} />
                    {errors.mobile && <p className="text-red-500 text-sm font-dm-sans">{errors.mobile}</p>}
                  </div>
                </div>

                <div className="space-y-2" ref={dropdownRef}>
                  <label htmlFor="branch" className="block text-sm font-medium text-gray-300">
                    Branch:
                  </label>
                  <div className="relative">
                    <div 
                      className="w-full px-4 py-3 bg-gray-800 border border-white rounded-lg text-white cursor-pointer flex items-center justify-between hover:bg-gray-750 transition-colors"
                      onClick={() => !loading && setShowBranchDropdown(!showBranchDropdown)}
                    >
                      <span className={formData.branch ? "text-white" : "text-gray-400"}>
                        {formData.branch || "Select Branch"}
                      </span>
                      <svg 
                        className={`w-5 h-5 transition-transform ${showBranchDropdown ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                  {errors.branch && <p className="text-red-500 text-sm font-dm-sans">{errors.branch}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password:</label>
                    <input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required placeholder="Enter password"
                      className={`w-full px-4 py-3 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-transparent ${errors.password ? 'border-red-500' : 'border-white'}`} />
                    {errors.password && <p className="text-red-500 text-sm font-dm-sans">{errors.password}</p>}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">Confirm Password:</label>
                    <input id="confirmPassword" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required placeholder="Re-enter password"
                      className={`w-full px-4 py-3 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-transparent ${errors.confirmPassword ? 'border-red-500' : 'border-white'}`} />
                    {errors.confirmPassword && <p className="text-red-500 text-sm font-dm-sans">{errors.confirmPassword}</p>}
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Creating Account..." : "Create Account"}
                </button>
              </fieldset>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                Already have an account?{" "}
                <Link to="/login" className="text-green-500 hover:text-green-400 font-medium transition-colors">
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <Footer />

      <Popup isOpen={popup.isOpen} onClose={closePopup} type={popup.type} message={popup.message} autoCloseDelay={popup.type === "success" ? 2000 : 5000} />
    </div>
  );
};