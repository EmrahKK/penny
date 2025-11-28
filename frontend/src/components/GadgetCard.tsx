import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';

interface GadgetCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  category: string;
  onRun: () => void;
  isRunning: boolean;
}

export const GadgetCard: React.FC<GadgetCardProps> = ({
  title,
  description,
  icon: Icon,
  category,
  onRun,
  isRunning
}) => {
  return (
    <div
      className={`border p-4 rounded-lg transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden ${
        isRunning
          ? 'bg-slate-100 dark:bg-slate-800/80 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
      }`}
      onClick={onRun}
    >
      {isRunning && (
        <div className="absolute top-0 right-0 bg-green-500/20 text-green-600 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded-bl">
          RUNNING
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-md ${
          category === 'trace' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' :
          category === 'top' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
          category === 'snapshot' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
          'bg-orange-500/20 text-orange-600 dark:text-orange-400'
        }`}>
          <Icon size={20} />
        </div>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-900 px-2 py-1 rounded">{category}</span>
      </div>
      <h3 className="text-slate-900 dark:text-slate-100 font-semibold mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 text-sm flex-grow">{description}</p>
      <div className="mt-4 flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        {isRunning ? 'View Output' : 'Configure & Run'} <ChevronRight size={16} className="ml-1" />
      </div>
    </div>
  );
};
