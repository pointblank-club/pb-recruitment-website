import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import { motion } from "framer-motion";
import { Popup } from "../components/ui/popup";

export const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: "success" | "error";
    message: string;
  }>({
    isOpen: false,
    type: "error",
    message: "",
  });
  const navigate = useNavigate();
  const location = useLocation();

  const requestedPath = (location.state as { from?: unknown } | null)?.from;
  const redirectPath = typeof requestedPath === "string"
    && requestedPath.startsWith("/")
    && !requestedPath.startsWith("//")
    ? requestedPath
    : "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      setPopup({
        isOpen: true,
        type: "success",
        message: "Login successful! Redirecting to homepage...",
      });
      setTimeout(() => {
        navigate(redirectPath, { replace: true });
      }, 2000);
    } catch (err: unknown) {
      let message = "Login failed. Please try again.";
      const errorCode = typeof err === "object" && err !== null && "code" in err
        ? String(err.code)
        : undefined;
      if (errorCode) {
        switch (errorCode) {
          case "auth/user-not-found":
            message = "User invalid, please sign up first";
            break;
          case "auth/wrong-password":
            message = "Incorrect password";
            break;
          case "auth/invalid-credential":
            message = "Invalid email";
            break;
          case "auth/user-disabled":
            message = "User is disabled";
            break;
          default:
            message = "Login failed. Please try again.";
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

  const closePopup = () => {
    setPopup(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="min-h-screen bg-black text-white font-dm-sans">
      <Navbar />
      
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="border-green border rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-medium text-white mb-2 font-anton tracking-wider">Welcome Back</h2>
              <p className="text-gray-400">Log in to your account</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                  Email:
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-white rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your email"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                  Password:
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-white rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                {loading ? "Logging in..." : "Log In"}
              </button>
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-green-500 hover:text-green-400 text-sm transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  className="text-green-500 hover:text-green-400 font-medium transition-colors"
                >
                  Sign up here
                </Link>
              </p>
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
