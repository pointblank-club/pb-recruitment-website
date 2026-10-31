import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import ContestHero from "./components/ContestHero";
import ContestTimeline from "./components/ContestTimeline";
import ContestDetails from "./components/ContestDetails";
import type { Contest } from "@/models/contest";
import { contestApi } from "@/services/api/contestApi";
import { toast } from "react-toastify";
import { useAuth } from "@/lib/AuthContext";

const ContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading: authLoading, user } = useAuth();

  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [contest, setContest] = React.useState<Contest | null | undefined>(null);
  useEffect(() => {
    if (authLoading) return;
    const fetchContest = async () => {
      try {
        setIsLoading(true);
        const data = await contestApi.getContestById(id!);
        if (!data) setContest(undefined);
        else setContest(data);
      } catch (error) {
        console.error("Error fetching contest:", error);
        toast.error("Error fetching contest details. Please try again later. If problem persists, contact volunteers.");
        setContest(undefined);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContest();
  }, [id, authLoading, user]);

  if (contest === undefined) {
    return (
      <div className="bg-black text-white min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-anton text-beige mb-4">
              Contest Not Found
            </h1>
            <p className="text-gray-300 mb-6">
              The contest you're looking for doesn't exist.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/contests")}
              className="bg-green text-black font-semibold px-8 py-3 rounded-full hover:bg-green-600 transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <ChevronLeft size={20} />
              Back to Contests
            </motion.button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen flex flex-col">
      <Navbar />

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin mr-2 h-8 w-8 text-green-500" />
          <p>Loading contest details...</p>
        </div>
      ) : (
        <>
          {/* Back Button */}
          <div className="w-full px-4 md:px-8 pt-6">
            <motion.button
              whileHover={{ x: -5 }}
              onClick={() => navigate("/contests")}
              className="flex items-center gap-2 text-green hover:text-green-400 transition-colors font-semibold"
            >
              <ChevronLeft size={20} />
              Back to Contests
            </motion.button>
          </div>

          <ContestHero contest={contest!} />
          <ContestTimeline contest={contest!} />
          <ContestDetails contest={contest!} />
        </>
      )}
      <Footer />
    </div>
  );
};

export default ContestDetail;