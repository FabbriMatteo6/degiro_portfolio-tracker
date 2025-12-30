'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { Dashboard } from '@/components/Dashboard';
import { usePortfolioStorage } from '@/lib/hooks/usePortfolioStorage';

export default function Home() {
  const [files, setFiles] = useState<{
    account: string;
    portfolio: string;
    transactions: string;
  } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const {
    savePortfolioData,
    loadPortfolioData,
    clearPortfolioData,
    getLastUpdated,
  } = usePortfolioStorage();

  // Load saved data on mount
  useEffect(() => {
    const savedData = loadPortfolioData();
    if (savedData?.accountCsv && savedData?.portfolioCsv && savedData?.transactionsCsv) {
      setFiles({
        account: savedData.accountCsv,
        portfolio: savedData.portfolioCsv,
        transactions: savedData.transactionsCsv,
      });
    }
    setIsLoading(false);
  }, [loadPortfolioData]);

  useEffect(() => {
    // Check system preference or saved preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const shouldBeDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    setIsDarkMode(shouldBeDark);

    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      localStorage.setItem('theme', newValue ? 'dark' : 'light');

      if (newValue) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      return newValue;
    });
  };

  const handleFilesLoaded = useCallback((loadedFiles: {
    account: string;
    portfolio: string;
    transactions: string;
  }) => {
    // Save to localStorage for persistence
    savePortfolioData({
      accountCsv: loadedFiles.account,
      portfolioCsv: loadedFiles.portfolio,
      transactionsCsv: loadedFiles.transactions,
    });
    setFiles(loadedFiles);
  }, [savePortfolioData]);

  const handleReset = useCallback(() => {
    clearPortfolioData();
    setFiles(null);
  }, [clearPortfolioData]);

  // Show loading state while checking localStorage
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/50 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (files) {
    return (
      <Dashboard
        files={files}
        onReset={handleReset}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        lastUpdated={getLastUpdated()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/50 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg bg-card hover:bg-muted transition-colors"
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>
      <FileUpload onFilesLoaded={handleFilesLoaded} />
    </div>
  );
}
