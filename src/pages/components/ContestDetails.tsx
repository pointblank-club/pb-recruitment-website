import React from "react";
import { motion } from "framer-motion";
import type { Contest } from "@/models/contest";

interface ContestDetailsProps {
  contest: Contest;
}

const ContestDetails: React.FC<ContestDetailsProps> = ({ contest }) => {
  const slideUp = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const eligibleYearsText = contest.formatEligibleYears();

  return (
    <section className="w-full px-4 md:px-8 py-12">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          animate="show"
          variants={staggerContainer}
          className="grid grid-cols-1 gap-8"
        >
          {/* Main Content */}
          <motion.div variants={slideUp} className="md:col-span-2">
            <div className="space-y-8">
              {/* Description */}
              <div>
                <h2 className="text-2xl font-anton text-green-400 mb-4 flex items-center gap-2">
                  About This Contest
                </h2>
                <p className="text-gray-300 whitespace-pre-line leading-relaxed">
                  {contest.description}
                </p>
              </div>

              {/* Rules & Eligibility */}
              <div>
                <h2 className="text-2xl font-anton text-green-400 mb-4">Contest Rules & Eligibility</h2>
                <span className="text-gray-300 leading-relaxed block">
                  • <strong className="text-white">Eligible Years:</strong> Open to students in <span className="text-green-400 font-semibold">{eligibleYearsText}</span>. <br />
                  • This is an individual contest. No collaboration is allowed. <br />
                  • You can use any programming language (C++, Python, Java, etc.). <br />
                  • External resources and search engines are not permitted during the contest. <br />
                  • Submissions will be evaluated against test cases. <br />
                  • Plagiarism will result in immediate disqualification.
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default ContestDetails;
