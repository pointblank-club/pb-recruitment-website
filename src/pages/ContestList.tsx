import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import ContestListHero from "./components/ContestListHero";
import ContestGrid from "./components/ContestGrid";
import type { Contest } from "@/models/contest";
import { contestApi } from "@/services/api/contestApi";
import { Loader2 } from "lucide-react";
import { toast } from 'react-toastify';

const ContestList: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchContests = async () => {
      try {
        setIsLoading(true);
        const response = await contestApi.getContestsList();
        if (isMounted) {
          setContests(response as Contest[]);
        }
      } catch {
        if (isMounted) {
          toast.error("Error fetching contests. Please try again later. If problem persists, contact volunteers.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchContests();
    return () => {
      isMounted = false;
    };
  }, []);

  const navigate = useNavigate();
  const handleContestClick = (contestId: string) => {
    navigate(`/contest/${contestId}`);
  };

  return (
    <div className="bg-black text-white min-h-screen flex flex-col">
      <Navbar />
      <ContestListHero />
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin mr-2 h-8 w-8 text-green-500" />
          <p>Loading contests...</p>
        </div>
      ) : (
        <ContestGrid
          contests={contests}
          onContestClick={handleContestClick}
        />
      )}
      <Footer />
    </div>
  );
};

export default ContestList;