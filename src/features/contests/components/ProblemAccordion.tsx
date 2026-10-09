import type { Problem } from '../problem.types';
import { ProblemCard } from './ProblemCard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ProblemAccordionProps {
  problems: Problem[];
  contestId: string;
}

export const ProblemAccordion = ({ problems, contestId }: ProblemAccordionProps) => {
  if (problems.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 font-['DM_Sans']">
        No problems found
      </div>
    );
  }

  const codeProblems = problems.filter(problem => problem.type === 'code');
  const mcqProblems = problems.filter(problem => problem.type === 'mcq');

  return (
    <div className="w-full">
      <Accordion type="multiple" className="w-full">
        {codeProblems.length > 0 && (
          <AccordionItem value="code" className="border-gray-700">
            <AccordionTrigger className="text-white hover:text-gray-300 font-['DM_Sans'] w-full">
              <div className="flex items-center gap-2">
                <span className="text-green text-xl">Code</span>
                <span className="text-gray-400 text-sm">({codeProblems.length} problems)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 w-full">
                {codeProblems.map((problem) => (
                  <ProblemCard 
                    key={problem.id} 
                    problem={problem} 
                    contestId={contestId} 
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {mcqProblems.length > 0 && (
          <AccordionItem value="mcq" className="border-gray-700">
            <AccordionTrigger className="text-white hover:text-gray-300 font-['DM_Sans'] w-full">
              <div className="flex items-center gap-2">
                <span className="text-green text-xl">MCQ</span>
                <span className="text-gray-400 text-sm">({mcqProblems.length} problems)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 w-full">
                {mcqProblems.map((problem) => (
                  <ProblemCard 
                    key={problem.id} 
                    problem={problem} 
                    contestId={contestId} 
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};
