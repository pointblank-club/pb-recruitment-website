import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, User, LogOut } from "lucide-react";
import Logo from "@/assets/logo.png";
import { useAuth } from "@/lib/AuthContext";

const authButtonBase =
  "h-10 w-24 rounded-full px-5 font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-black";
const loginButtonClass = `${authButtonBase} bg-green text-white hover:bg-green-700`;
const signupButtonClass =
  `${authButtonBase} border-2 border-green bg-transparent text-white hover:bg-green`;

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const mobileMenuVariants = {
    hidden: {
      height: 0,
      opacity: 0,
      borderBottom: "1px solid rgba(156, 163, 175, 0)",
      transition: {
        height: { duration: 0.8 },
        opacity: { duration: 0.3 },
      },
    },
    show: {
      height: "auto",
      opacity: 1,
      borderBottom: "1px solid rgba(156, 163, 175, 0.4)",
      transition: {
        height: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.4, ease: "easeOut" },
        when: "beforeChildren",
        staggerChildren: 0.1,
      },
    },
    exit: {
      height: 0,
      opacity: 0,
      borderBottom: "1px solid rgba(156, 163, 175, 0)",
      transition: {
        height: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.3 },
        when: "afterChildren",
        staggerChildren: 0.05,
        staggerDirection: -1,
      },
    },
  };

  const mobileItemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  };

  const desktopFade = {
    hidden: { opacity: 0, y: -10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: "easeOut" },
    },
  };

  return (
    <motion.nav
      className="w-full font-dm-sans bg-black text-white shadow-sm md:border-b border-gray-400 px-4 sm:px-6 py-3"
      initial="hidden"
      animate="show"
      variants={desktopFade}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Link to="/" className="flex items-center space-x-2">
            <img
              src={Logo}
              alt="Logo"
              className="object-fill w-40 hover:scale-105 transition-transform"
            />
          </Link>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-6">
          <a
            href="/contests"
            className="text-gray-300 hover:text-green-600 transition-colors font-medium"
          >
            Contest
          </a>
          <a
            href="/contests"
            className="text-gray-300 hover:text-green-600 transition-colors font-medium"
          >
            Leaderboard
          </a>
          {user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/profile")}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 transition-colors"
              >
                <User className="w-5 h-5 text-white" />
              </button>
              <Button 
                className="border-2 border-red-500 text-red-500 font-semibold px-4 py-2 rounded-full hover:bg-red-500 hover:text-white transition-colors"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                className={loginButtonClass}
                onClick={() => navigate("/login")}
              >
                Log In
              </Button>
              <Button
                className={signupButtonClass}
                onClick={() => navigate("/signup")}
              >
                Sign Up
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-white focus:outline-none"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key="mobileMenu"
            initial="hidden"
            animate="show"
            exit="exit"
            variants={mobileMenuVariants}
            className="md:hidden overflow-hidden"
          >
            <div className="py-8 space-y-4">
              <motion.a
                variants={mobileItemVariants}
                href="/contests"
                className="block text-white hover:text-gray-400 font-medium px-2"
              >
                Contest
              </motion.a>
              <motion.a
                variants={mobileItemVariants}
                href="/contests"
                className="block text-white hover:text-gray-400 font-medium px-2"
              >
                Leaderboard
              </motion.a>
              <motion.div variants={mobileItemVariants} className="px-2 flex flex-col gap-3">
                {user ? (
                  <>
                    <button
                      onClick={() => {
                        navigate("/profile");
                        setIsOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      <User className="w-5 h-5" />
                      Profile
                    </button>
                    <Button 
                      className="w-full border-2 border-red-500 text-red-500 font-semibold px-5 py-2 rounded-full hover:bg-red-500 hover:text-white transition-colors"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className={`w-full ${loginButtonClass}`}
                      onClick={() => navigate("/login")}
                    >
                      Log In
                    </Button>
                    <Button
                      className={`w-full ${signupButtonClass}`}
                      onClick={() => navigate("/signup")}
                    >
                      Sign Up
                    </Button>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
