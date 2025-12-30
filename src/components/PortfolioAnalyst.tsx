'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Brain,
    RefreshCw,
    Trash2,
    AlertTriangle,
    CheckCircle2,
    TrendingUp,
    Target,
    PieChart,
    BarChart3,
    Lightbulb,
    Clock,
    Activity
} from 'lucide-react';

// Types
interface UserProfile {
    age: number;
    riskTolerance: string;
    investingObjective: string;
    investingDeadline: number;
    monthlyInvestmentCapacity: number;
    incomeLevel: string;
    existingDebts: number;
    countryOfResidence: string;
}

interface AnalysisResult {
    healthScore: number;
    healthScoreReason: string;
    riskAssessment: {
        currentRisk: string;
        matchesProfile: boolean;
        explanation: string;
    };
    diversificationAnalysis: {
        sectorDiversification: string;
        geographicDiversification: string;
        assetClassDiversification: string;
        details: string;
    };
    benchmarkComparison: {
        vsSP500: string;
        vsMSCIWorld: string;
        commentary: string;
    };
    suggestions: string[];
    warnings: string[];
    targetAllocation: Record<string, number>;
    timelineGoals: {
        onTrack: boolean;
        projectedValue: string;
        monthlyNeeded: string;
        analysis: string;
    };
    generatedAt: string;
}

interface ConfigOptions {
    riskTolerance: string[];
    investingObjective: string[];
    incomeLevel: string[];
}

interface PortfolioAnalystProps {
    portfolioData: {
        totalValue: number;
        totalCost: number;
        totalGain: number;
        totalGainPercent: number;
        cashBalance: number;
        positions: any[];
        allocations: {
            bySector: any[];
            byGeography: any[];
            byAssetClass: any[];
        };
        metrics: {
            twr: number;
            mwr: number;
            cagr: number;
            sharpeRatio: number;
            sortinoRatio: number;
            maxDrawdown: number;
            volatility: number;
        };
        benchmarkComparison?: {
            sp500Return: number;
            msciWorldReturn: number;
        };
    };
}

const STORAGE_KEY = 'portfolio-analyst-inputs';

const DEFAULT_PROFILE: UserProfile = {
    age: 30,
    riskTolerance: 'Moderate',
    investingObjective: 'Wealth Building',
    investingDeadline: 10,
    monthlyInvestmentCapacity: 500,
    incomeLevel: '€50-80k',
    existingDebts: 0,
    countryOfResidence: 'Italy',
};

export function PortfolioAnalyst({ portfolioData }: PortfolioAnalystProps) {
    const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_PROFILE);
    const [configOptions, setConfigOptions] = useState<ConfigOptions | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isConfigured, setIsConfigured] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load saved inputs and config on mount
    useEffect(() => {
        // Load from localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                setUserProfile(JSON.parse(saved));
            } catch {
                // Ignore parse errors
            }
        }

        // Fetch config options and cached analysis
        fetch('/api/portfolio-analyst')
            .then(res => res.json())
            .then(data => {
                setConfigOptions(data.configOptions);
                setIsConfigured(data.isConfigured);
                if (data.cached?.analysis) {
                    setAnalysis(data.cached.analysis);
                }
            })
            .catch(err => console.error('Failed to load analyst config:', err));
    }, []);

    // Save inputs to localStorage when they change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userProfile));
    }, [userProfile]);

    // Handle input changes
    const handleChange = (field: keyof UserProfile, value: string | number) => {
        setUserProfile(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    // Submit analysis
    const handleSubmit = async (forceReanalyze = false) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/portfolio-analyst', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userProfile,
                    portfolioSnapshot: portfolioData,
                    forceReanalyze,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Analysis failed');
            }

            setAnalysis(data.analysis);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsLoading(false);
        }
    };

    // Clear analysis
    const handleClear = async () => {
        try {
            await fetch('/api/portfolio-analyst', { method: 'DELETE' });
            setAnalysis(null);
        } catch {
            // Ignore errors
        }
    };

    // Health score color
    const getHealthColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        if (score >= 40) return 'text-orange-500';
        return 'text-red-500';
    };

    const getHealthBg = (score: number) => {
        if (score >= 80) return 'bg-green-500/10 border-green-500/30';
        if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/30';
        if (score >= 40) return 'bg-orange-500/10 border-orange-500/30';
        return 'bg-red-500/10 border-red-500/30';
    };

    if (!isConfigured) {
        return (
            <Card className="bg-amber-500/10 border-amber-500/30">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <p>Portfolio Analyst requires GEMINI_API_KEY_PORTFOLIO to be configured.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* User Profile Form */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-500" />
                        <CardTitle>AI Portfolio Analyst</CardTitle>
                    </div>
                    <CardDescription>
                        Fill in your investment profile to receive personalized portfolio analysis
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Age */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Age</label>
                            <input
                                type="number"
                                value={userProfile.age}
                                onChange={(e) => handleChange('age', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                                min={18}
                                max={100}
                            />
                        </div>

                        {/* Risk Tolerance */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Risk Tolerance</label>
                            <select
                                value={userProfile.riskTolerance}
                                onChange={(e) => handleChange('riskTolerance', e.target.value)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                            >
                                {(configOptions?.riskTolerance || ['Conservative', 'Moderate', 'Aggressive', 'Very Aggressive']).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>

                        {/* Investing Objective */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Investing Objective</label>
                            <select
                                value={userProfile.investingObjective}
                                onChange={(e) => handleChange('investingObjective', e.target.value)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                            >
                                {(configOptions?.investingObjective || ['Retirement', 'Wealth Building']).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>

                        {/* Investing Deadline */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Timeline (years)</label>
                            <input
                                type="number"
                                value={userProfile.investingDeadline}
                                onChange={(e) => handleChange('investingDeadline', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                                min={1}
                                max={50}
                            />
                        </div>

                        {/* Monthly Investment */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Monthly Investment (€)</label>
                            <input
                                type="number"
                                value={userProfile.monthlyInvestmentCapacity}
                                onChange={(e) => handleChange('monthlyInvestmentCapacity', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                                min={0}
                            />
                        </div>

                        {/* Income Level */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Income Level</label>
                            <select
                                value={userProfile.incomeLevel}
                                onChange={(e) => handleChange('incomeLevel', e.target.value)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                            >
                                {(configOptions?.incomeLevel || ['<€30k', '€30-50k', '€50-80k', '€80-120k', '>€120k']).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>

                        {/* Existing Debts */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Existing Debts (€)</label>
                            <input
                                type="number"
                                value={userProfile.existingDebts}
                                onChange={(e) => handleChange('existingDebts', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                                min={0}
                            />
                        </div>

                        {/* Country */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Country of Residence</label>
                            <input
                                type="text"
                                value={userProfile.countryOfResidence}
                                onChange={(e) => handleChange('countryOfResidence', e.target.value)}
                                className="w-full px-3 py-2 rounded-md border bg-background"
                                placeholder="e.g., Italy"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-6">
                        <Button
                            onClick={() => handleSubmit(false)}
                            disabled={isLoading}
                            className="gap-2"
                        >
                            {isLoading ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Brain className="h-4 w-4" />
                            )}
                            Analyze Portfolio
                        </Button>

                        {analysis && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => handleSubmit(true)}
                                    disabled={isLoading}
                                    className="gap-2"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Re-analyze
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={handleClear}
                                    disabled={isLoading}
                                    className="gap-2 text-muted-foreground"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Clear
                                </Button>
                            </>
                        )}

                        {error && (
                            <span className="text-sm text-red-500">{error}</span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Analysis Results */}
            {analysis && (
                <div className="space-y-4">
                    {/* Health Score Hero */}
                    <Card className={`border-2 ${getHealthBg(analysis.healthScore)}`}>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`text-6xl font-bold ${getHealthColor(analysis.healthScore)}`}>
                                        {analysis.healthScore}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold">Portfolio Health Score</h3>
                                        <p className="text-muted-foreground">{analysis.healthScoreReason}</p>
                                    </div>
                                </div>
                                <Activity className={`h-12 w-12 ${getHealthColor(analysis.healthScore)}`} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Risk Assessment & Diversification */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Risk Assessment */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <Target className="h-5 w-5 text-blue-500" />
                                    <CardTitle className="text-lg">Risk Assessment</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Current Risk Level</span>
                                        <Badge variant={analysis.riskAssessment.matchesProfile ? 'default' : 'destructive'}>
                                            {analysis.riskAssessment.currentRisk}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {analysis.riskAssessment.matchesProfile ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                        )}
                                        <span className={analysis.riskAssessment.matchesProfile ? 'text-green-500' : 'text-amber-500'}>
                                            {analysis.riskAssessment.matchesProfile ? 'Matches your profile' : 'Does not match profile'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{analysis.riskAssessment.explanation}</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Diversification */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <PieChart className="h-5 w-5 text-purple-500" />
                                    <CardTitle className="text-lg">Diversification</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span>Sector</span>
                                        <Badge variant="outline">{analysis.diversificationAnalysis.sectorDiversification}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Geographic</span>
                                        <Badge variant="outline">{analysis.diversificationAnalysis.geographicDiversification}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Asset Class</span>
                                        <Badge variant="outline">{analysis.diversificationAnalysis.assetClassDiversification}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground pt-2">{analysis.diversificationAnalysis.details}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Benchmark & Timeline */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Benchmark Comparison */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5 text-green-500" />
                                    <CardTitle className="text-lg">Benchmark Comparison</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span>vs S&P 500</span>
                                        <Badge variant={analysis.benchmarkComparison.vsSP500 === 'Outperforming' ? 'default' : 'secondary'}>
                                            {analysis.benchmarkComparison.vsSP500}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>vs MSCI World</span>
                                        <Badge variant={analysis.benchmarkComparison.vsMSCIWorld === 'Outperforming' ? 'default' : 'secondary'}>
                                            {analysis.benchmarkComparison.vsMSCIWorld}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground pt-2">{analysis.benchmarkComparison.commentary}</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Timeline Goals */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-orange-500" />
                                    <CardTitle className="text-lg">Timeline Goals</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        {analysis.timelineGoals.onTrack ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                                        )}
                                        <span className={analysis.timelineGoals.onTrack ? 'text-green-500 font-medium' : 'text-amber-500 font-medium'}>
                                            {analysis.timelineGoals.onTrack ? 'On Track' : 'Needs Attention'}
                                        </span>
                                    </div>
                                    <div className="text-sm space-y-1">
                                        <p><strong>Projected Value:</strong> {analysis.timelineGoals.projectedValue}</p>
                                        {!analysis.timelineGoals.onTrack && (
                                            <p><strong>Monthly Needed:</strong> {analysis.timelineGoals.monthlyNeeded}</p>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">{analysis.timelineGoals.analysis}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Suggestions & Warnings */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Suggestions */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                                    <CardTitle className="text-lg">Suggestions</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {analysis.suggestions.map((suggestion, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <TrendingUp className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                            <span className="text-sm">{suggestion}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Warnings */}
                        <Card className={analysis.warnings.length > 0 ? 'border-amber-500/30' : ''}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                                    <CardTitle className="text-lg">Warnings</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {analysis.warnings.length > 0 ? (
                                    <ul className="space-y-2">
                                        {analysis.warnings.map((warning, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                                <span className="text-sm">{warning}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        No significant warnings
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Target Allocation */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <PieChart className="h-5 w-5 text-blue-500" />
                                <CardTitle className="text-lg">Recommended Target Allocation</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-4">
                                {Object.entries(analysis.targetAllocation).map(([key, value]) => (
                                    <div key={key} className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg">
                                        <span className="font-medium">{key}:</span>
                                        <span className="text-primary">{value}%</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Footer */}
                    <p className="text-xs text-muted-foreground text-center">
                        Analysis generated on {new Date(analysis.generatedAt).toLocaleString()}.
                        This is AI-generated advice and should not replace professional financial consultation.
                    </p>
                </div>
            )}
        </div>
    );
}
