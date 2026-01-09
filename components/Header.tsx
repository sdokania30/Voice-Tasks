import React, { useState, useRef, useEffect } from 'react';
import { ListIcon, ChartBarIcon, CreditCardIcon } from './Icons';

type Page = 'tasks' | 'trading' | 'payments';

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  tradingEnabled: boolean;
  onToggleTrading: () => void;
}

interface NavButtonProps {
    page: Page;
    label: string;
    icon: React.ReactNode;
    isIconOnly?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ currentPage, onNavigate, tradingEnabled, onToggleTrading }) => {
  const [logoClickCount, setLogoClickCount] = useState(0);
  const logoClickTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (logoClickTimer.current) {
        clearTimeout(logoClickTimer.current);
      }
    };
  }, []);

  const handleLogoClick = () => {
    if (logoClickTimer.current) {
      clearTimeout(logoClickTimer.current);
    }

    const newCount = logoClickCount + 1;
    if (newCount >= 5) {
      onToggleTrading();
      setLogoClickCount(0);
    } else {
      setLogoClickCount(newCount);
      logoClickTimer.current = window.setTimeout(() => {
        setLogoClickCount(0);
      }, 1500);
    }
  };
  
  const NavButton: React.FC<NavButtonProps> = ({ page, label, icon, isIconOnly = false }) => {
    const isActive = currentPage === page;
    return (
      <button
        onClick={() => onNavigate(page)}
        title={label}
        className={`flex-1 sm:flex-initial justify-center flex items-center gap-2 rounded-lg text-sm font-semibold transition-colors ${
          isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'
        } ${isIconOnly ? 'p-2' : 'px-4 py-2'}`}
      >
        {icon}
        {!isIconOnly && <span>{label}</span>}
      </button>
    );
  };

  return (
    <header className="pt-[max(1rem,env(safe-area-inset-top))] p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 bg-white">
      <div className="flex items-center space-x-4">
        <div 
          onClick={handleLogoClick}
          title={tradingEnabled ? "Click 5 times to hide advanced features" : "Click 5 times to unlock advanced features"}
          className="flex-shrink-0 bg-slate-800 text-white w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl cursor-pointer"
          aria-roledescription="button"
          >
          VT
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Voice → Data</h1>
          <p className="text-sm text-slate-500">Auto-structured tasks & trades</p>
        </div>
      </div>
      <nav className="flex w-full sm:w-auto items-center gap-2 p-1 bg-slate-100 rounded-xl">
        <NavButton page="tasks" label="Tasks" icon={<ListIcon className="w-5 h-5" />} />
        <NavButton page="payments" label="Payments" icon={<CreditCardIcon className="w-5 h-5" />} />
        {tradingEnabled && <NavButton page="trading" label="Trading" icon={<ChartBarIcon className="w-5 h-5" />} isIconOnly />}
      </nav>
    </header>
  );
};