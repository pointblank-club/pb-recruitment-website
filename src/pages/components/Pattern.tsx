import { motion } from "framer-motion";

export default function Pattern() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.2 },
    },
  };

  const slide = {
    hidden: { opacity: 0, y: 40 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
  };

  return (
    <section className="w-full bg-black text-white px-10 py-16 md:py-24">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={container}
        className="max-w-6xl mx-auto"
      >
        <div className="mb-10 md:mb-14">
          <div className="leading-none">
            <motion.h2
              variants={slide}
              className="font-anton text-[56px] md:text-[120px] tracking-tight text-transparent \
              [-webkit-text-stroke-width:2px] [-webkit-text-stroke-color:#E5E5E5] text-left"
              style={{ WebkitTextStrokeWidth: 2 as unknown as string, WebkitTextStrokeColor: "#E5E5E5" }}
            >
              EXAM
            </motion.h2>
            <motion.h3
              variants={slide}
              className="font-anton text-beige text-[56px] md:text-[120px] tracking-tight text-left"
            >
              PATTERN
            </motion.h3>
          </div>
        </div>

        <motion.div
          variants={slide}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="rounded-2xl border border-gray-700/60 bg-zinc-900/40 p-6">
            <div className="text-4xl md:text-5xl font-anton text-green mb-2">60</div>
            <div className="text-xl font-semibold mb-1">MCQ Questions</div>
            <p className="text-gray-300 text-sm md:text-base">Quick multiple-choice questions covering CS fundamentals and basic problem solving.</p>
          </div>
          <div className="rounded-2xl border border-gray-700/60 bg-zinc-900/40 p-6">
            <div className="text-4xl md:text-5xl font-anton text-green mb-2">6</div>
            <div className="text-xl font-semibold mb-1">DSA Problems</div>
            <p className="text-gray-300 text-sm md:text-base">Algorithmic coding tasks of increasing difficulty to assess depth and speed.</p>
          </div>
          <div className="rounded-2xl border border-gray-700/60 bg-zinc-900/40 p-6">
            <div className="text-4xl md:text-5xl font-anton text-green mb-2">180 min</div>
            <div className="text-xl font-semibold mb-1">Total Duration</div>
            <p className="text-gray-300 text-sm md:text-base">Single sitting. Partial scoring enabled. Languages: C, C++, Java, Javascript and Python.</p>
          </div>
        </motion.div>

        <motion.div variants={slide} className="mt-8 md:mt-10 grid gap-4 md:grid-cols-3">
          <div className="text-gray-400 text-sm">
            - Negative marking does not apply for MCQs.
          </div>
          <div className="text-gray-400 text-sm">
            - Custom test cases available for DSA problems after initial submission.
          </div>
          <div className="text-gray-400 text-sm">
            - Live Leaderboards
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}


