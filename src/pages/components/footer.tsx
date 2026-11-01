import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { Link } from "react-router-dom";
import { Instagram, Twitter, Linkedin, Trophy, Code2 } from "lucide-react";

export default function Footer() {
  const containerVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <footer className="bg-black text-beige p-12 mt-auto boreder border-t-1 border-gray-400">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={containerVariants}
        className="container mx-auto px-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div variants={fadeInUp} className="flex flex-col items-start">
            <Link to="https://pointblank.club" className="flex items-center space-x-2">
              <img src={logo} alt="PB DSC Logo" className="h-6 mb-4 hover:scale-105 transition-transform" />
            </Link>
          </motion.div>

          <motion.div variants={fadeInUp} className="flex flex-col items-start text-left">
            <h3 className="text-xl mb-4">Quick Links</h3>
            <motion.div
              className="flex flex-col space-y-2"
              variants={containerVariants}
            >
              <motion.a
                href="/contests"
                className="text-gray-400 hover:text-green transition-colors flex items-center gap-2"
                variants={fadeInUp}
              >
                <Trophy size={20} /> Leaderboard
              </motion.a>
              <motion.a
                href="/contests"
                className="text-gray-400 hover:text-green transition-colors flex items-center gap-2"
                variants={fadeInUp}
              >
                <Code2 size={20} /> Contests
              </motion.a>
            </motion.div>
          </motion.div>

          <motion.div variants={fadeInUp} className="flex flex-col items-start text-left">
            <h3 className="text-xl mb-4">Connect With Us</h3>
            <div className="flex space-x-4">
              <motion.a
                href="https://x.com/pointblank_club"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-gray-400 hover:text-green transition-colors"
              >
                <Twitter size={24} />
              </motion.a>
              <motion.a
                href="https://www.instagram.com/pointblank_club_"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-gray-400 hover:text-green transition-colors"
              >
                <Instagram size={24} />
              </motion.a>
              <motion.a
                href="https://www.linkedin.com/company/pointblank-club/"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-gray-400 hover:text-green transition-colors"
              >
                <Linkedin size={24} />
              </motion.a>
            </div>
          </motion.div>
        </div>

        <motion.div
          variants={fadeInUp}
          className="text-center text-gray-500 text-sm mt-12 pt-8 border-t border-gray-800"
        >
          Made with ❤️ by Point Blank. All Rights Reserved.
        </motion.div>
      </motion.div>
    </footer>
  );
}
