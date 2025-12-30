'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
    onFilesLoaded: (files: {
        account: string;
        portfolio: string;
        transactions: string;
    }) => void;
}

interface FileStatus {
    account: { loaded: boolean; name: string };
    portfolio: { loaded: boolean; name: string };
    transactions: { loaded: boolean; name: string };
}

export function FileUpload({ onFilesLoaded }: FileUploadProps) {
    const [fileStatus, setFileStatus] = useState<FileStatus>({
        account: { loaded: false, name: '' },
        portfolio: { loaded: false, name: '' },
        transactions: { loaded: false, name: '' },
    });
    const [fileContents, setFileContents] = useState<{
        account: string;
        portfolio: string;
        transactions: string;
    }>({ account: '', portfolio: '', transactions: '' });
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const detectFileType = (filename: string, content: string): 'account' | 'portfolio' | 'transactions' | null => {
        const lowerName = filename.toLowerCase();
        const firstLine = content.split('\n')[0].toLowerCase();

        if (lowerName.includes('account') || firstLine.includes('data,ora,data valore')) {
            return 'account';
        }
        if (lowerName.includes('portfolio') || firstLine.includes('prodotto,codice,quantità')) {
            return 'portfolio';
        }
        if (lowerName.includes('transaction') || firstLine.includes('data,ora,prodotto,isin,borsa di riferimento')) {
            return 'transactions';
        }
        return null;
    };

    const handleFile = useCallback(async (file: File) => {
        try {
            const content = await file.text();
            const fileType = detectFileType(file.name, content);

            if (!fileType) {
                setError(`Could not detect file type for: ${file.name}. Please ensure files are named Account.csv, Portfolio.csv, or Transactions.csv`);
                return;
            }

            setError(null);
            setFileStatus(prev => ({
                ...prev,
                [fileType]: { loaded: true, name: file.name },
            }));
            setFileContents(prev => ({
                ...prev,
                [fileType]: content,
            }));
        } catch (err) {
            setError(`Error reading file: ${file.name}`);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        files.forEach(handleFile);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            Array.from(files).forEach(handleFile);
        }
    }, [handleFile]);

    const allFilesLoaded = fileStatus.account.loaded && fileStatus.portfolio.loaded && fileStatus.transactions.loaded;

    const handleAnalyze = () => {
        if (allFilesLoaded) {
            onFilesLoaded(fileContents);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-6">
            <Card className="bg-card/50 backdrop-blur-sm border-2">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                        DEGIRO Portfolio Tracker
                    </CardTitle>
                    <CardDescription className="text-lg">
                        Upload your DEGIRO export files to analyze your portfolio performance
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`
              relative border-2 border-dashed rounded-xl p-12 text-center
              transition-all duration-300 cursor-pointer
              ${isDragging
                                ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
                                : 'border-muted-foreground/30 hover:border-blue-400 hover:bg-blue-500/5'
                            }
            `}
                    >
                        <input
                            type="file"
                            multiple
                            accept=".csv"
                            onChange={handleInputChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Upload className={`mx-auto h-16 w-16 mb-4 transition-colors ${isDragging ? 'text-blue-500' : 'text-muted-foreground'}`} />
                        <p className="text-xl font-medium mb-2">
                            {isDragging ? 'Drop files here' : 'Drag & drop your CSV files here'}
                        </p>
                        <p className="text-muted-foreground">
                            or click to browse
                        </p>
                    </div>

                    {/* File Status */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(['account', 'portfolio', 'transactions'] as const).map((type) => (
                            <div
                                key={type}
                                className={`
                  flex items-center gap-3 p-4 rounded-lg border-2 transition-all
                  ${fileStatus[type].loaded
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-muted-foreground/20 bg-muted/50'
                                    }
                `}
                            >
                                {fileStatus[type].loaded ? (
                                    <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
                                ) : (
                                    <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <p className="font-medium capitalize">{type}</p>
                                    <p className="text-sm text-muted-foreground truncate">
                                        {fileStatus[type].loaded ? fileStatus[type].name : 'Not uploaded'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {/* Analyze Button */}
                    <Button
                        onClick={handleAnalyze}
                        disabled={!allFilesLoaded}
                        className={`
              w-full py-6 text-lg font-semibold transition-all
              ${allFilesLoaded
                                ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
                                : ''
                            }
            `}
                    >
                        {allFilesLoaded ? '🚀 Analyze Portfolio' : 'Upload all 3 files to continue'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
