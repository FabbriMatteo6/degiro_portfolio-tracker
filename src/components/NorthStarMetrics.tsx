'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Target, Award } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/utils/format';

interface NorthStarMetricsProps {
    totalValue: number;
    totalGain: number;
    totalGainPercent: number;
    twr: number; // "Skill Score"
}

/**
 * NorthStarMetrics Component
 * 
 * The "North Star" tier of the 3-tier dashboard layout.
 * Shows the three most important metrics at a glance:
 * - Net Liquidation Value (large, bold)
 * - Total P&L (pill-shaped badge)
 * - TWR "Skill Score" (investment skill independent of timing)
 */
export function NorthStarMetrics({
    totalValue,
    totalGain,
    totalGainPercent,
    twr,
}: NorthStarMetricsProps) {
    const isPositive = totalGain >= 0;
    const isTwrPositive = twr >= 0;

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 md:p-8 border border-slate-700/50">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-purple-500/10" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/20 to-transparent rounded-full blur-3xl" />

            <div className="relative z-10">
                {/* Main metrics row */}
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                    {/* Net Value - The Star */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <Wallet className="h-5 w-5 text-blue-400" />
                            <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                Net Portfolio Value
                            </span>
                        </div>
                        <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight">
                            {formatCurrency(totalValue)}
                        </div>
                    </div>

                    {/* Secondary metrics */}
                    <div className="flex flex-wrap gap-4 md:gap-6">
                        {/* P&L Badge */}
                        <div className={`
                            flex items-center gap-3 px-5 py-3 rounded-xl
                            ${isPositive
                                ? 'bg-green-500/20 border border-green-500/30'
                                : 'bg-red-500/20 border border-red-500/30'
                            }
                        `}>
                            <div className="flex items-center gap-1">
                                {isPositive ? (
                                    <TrendingUp className="h-5 w-5 text-green-400" />
                                ) : (
                                    <TrendingDown className="h-5 w-5 text-red-400" />
                                )}
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider">P&L</div>
                                <div className={`text-xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                    {isPositive ? '+' : ''}{formatCurrency(totalGain)}
                                </div>
                                <div className={`text-sm ${isPositive ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                    {isPositive ? '+' : ''}{totalGainPercent.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* Skill Score (TWR) */}
                        <div className={`
                            flex items-center gap-3 px-5 py-3 rounded-xl
                            ${isTwrPositive
                                ? 'bg-purple-500/20 border border-purple-500/30'
                                : 'bg-orange-500/20 border border-orange-500/30'
                            }
                        `}>
                            <div className="flex items-center gap-1">
                                <Award className={`h-5 w-5 ${isTwrPositive ? 'text-purple-400' : 'text-orange-400'}`} />
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider">Skill Score</div>
                                <div className={`text-xl font-bold ${isTwrPositive ? 'text-purple-400' : 'text-orange-400'}`}>
                                    {formatPercent(twr)}
                                </div>
                                <div className="text-xs text-slate-500">TWR</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
