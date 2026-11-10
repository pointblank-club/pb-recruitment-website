import React from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import TestPage from "./pages/test_page";
import Home from "./pages/Home";
import ContestDetail from "./pages/ContestDetail";
import ContestList from "./pages/ContestList";
import { ContestProblemsPage } from './features/contests/pages/ContestProblemsPage';
import { ContestProblemPage } from './features/contests/pages/ContestProblemPage';
import { ContestLeaderboardPage } from './features/contests/pages/ContestLeaderboardPage';
import { ContestLayout } from './features/contests/layouts/ContestLayout';
import { Login } from "./pages/LogIn";
import { Signup } from "./pages/SignUp";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Profile } from "./pages/Profile";
import Admin from "./pages/Admin";
import AddContest from "./pages/AddContest";
import AdminContestProblems from "./pages/AdminContestProblems";
import AdminContestContestants from "./pages/AdminContestContestants";
import AdminContestPlagiarism from "./pages/AdminContestPlagiarism";
import AdminContestSubmissions from "./pages/AdminContestSubmissions";
import { AdminRoute } from "./components/AdminRoute";
import { AuthenticatedRoute } from "./components/AuthenticatedRoute";
import { useAuth } from "./lib/AuthContext";
import * as Sentry from "@sentry/react";

const App: React.FC = () => {
  const { user } = useAuth();

  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-3xl font-anton text-beige mb-3">Something Went Wrong</h1>
          <p className="text-gray-400 mb-6 max-w-md">
            An unexpected interface error occurred. Please reload. If this continues, contact the technical team.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-green px-8 py-3 rounded-full text-black font-semibold hover:bg-green-600 transition-colors"
          >
            Reload Interface
          </button>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/contests" element={<ContestList />} />
        <Route
          path="/contest/:id"
          element={<ContestDetail key={user?.uid || "guest"} />}
        />
        <Route
          path="/contests/:contestId"
          element={<ContestLayout />}
        >
          <Route path="problems" element={<ContestProblemsPage />} />
          <Route path="problems/:problemId" element={<ContestProblemPage />} />
          <Route path="leaderboard" element={<ContestLeaderboardPage />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/profile" element={<AuthenticatedRoute><Profile /></AuthenticatedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="/admin/contest/create" element={<AdminRoute><AddContest /></AdminRoute>} />
        <Route path="/admin/contest/:contestId/edit" element={<AdminRoute><AddContest /></AdminRoute>} />
        <Route path="/admin/contest/:contestId/problems" element={<AdminRoute><AdminContestProblems /></AdminRoute>} />
        <Route path="/admin/contest/:contestId/contestants" element={<AdminRoute><AdminContestContestants /></AdminRoute>} />
        <Route path="/admin/contest/:contestId/submissions" element={<AdminRoute><AdminContestSubmissions /></AdminRoute>} />
        <Route path="/admin/contest/:contestId/plagiarism" element={<AdminRoute><AdminContestPlagiarism /></AdminRoute>} />
      </Routes>
    </Sentry.ErrorBoundary>
  );
};

export default App;
