'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { Transaction } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface OperationsTableProps {
    transactions: Transaction[];
    timePeriodLabel?: string;
}

export function OperationsTable({ transactions, timePeriodLabel = 'Period' }: OperationsTableProps) {
    // 1. Filter and Process Data
    // We only want actual trades (Buy/Sell), not deposits/withdrawals (Product = '') 
    // though `Transaction` usually implies trades. parseTransactionsCsv filters invalid ones slightly.
    // We assume incoming `transactions` are already filtered by date range if needed, 
    // OR we might want to do it here? 
    // The prompt implied filtering by selected time period. 
    // Let's assume the PARENT passes the correct time-windowed transactions.

    const operations = useMemo(() => {
        // Helper to get safe timestamp
        const getTimestamp = (d: Date | string | undefined): number => {
            if (!d) return 0;
            const dateObj = d instanceof Date ? d : new Date(d);
            const time = dateObj.getTime();
            return isNaN(time) ? 0 : time;
        };

        return [...transactions]
            .filter(tx => tx.product && tx.quantity !== 0)
            .sort((a, b) => {
                const timeA = getTimestamp(a.date);
                const timeB = getTimestamp(b.date);
                const dateDiff = timeB - timeA;

                if (dateDiff !== 0) return dateDiff;
                // If same date, compare time string (HH:MM) descending
                return (b.time || '').localeCompare(a.time || '');
            });
    }, [transactions]);

    // 2. Summary Metrics
    const summary = useMemo(() => {
        let buyVolume = 0;
        let sellVolume = 0;
        let buyCount = 0;
        let sellCount = 0;
        let transactionFees = 0;
        let fxFees = 0;

        for (const op of operations) {
            const amount = Math.abs(op.totalEur);
            if (op.quantity > 0) { // Buy
                buyVolume += amount;
                buyCount++;
            } else { // Sell
                sellVolume += amount;
                sellCount++;
            }
            // Breakdown fees
            transactionFees += Math.abs(op.transactionFee);
            fxFees += Math.abs(op.autoFxFee);
        }

        const totalFees = transactionFees + fxFees;

        return { buyVolume, sellVolume, buyCount, sellCount, totalFees, transactionFees, fxFees };
    }, [operations]);

    // 3. Chart Data (Group by Product or Just Total Buy/Sell?)
    // User asked for "Total Buy Vol vs Sell Vol". A simple 2-bar chart is good.
    const chartData = [
        { name: 'Buy Volume', volume: summary.buyVolume, fill: '#22c55e' }, // Green-500
        { name: 'Sell Volume', volume: summary.sellVolume, fill: '#ef4444' }, // Red-500
    ];

    if (operations.length === 0) {
        return (
            <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Operations</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">No trading operations found for this period.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Top Row: Summary Stats & Chart */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Stats Card */}
                <Card className="bg-card/50 backdrop-blur-sm md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Activity Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-xs text-muted-foreground">Total Buy Volume</p>
                            <p className="text-2xl font-bold text-green-500">{formatCurrency(summary.buyVolume)}</p>
                            <p className="text-xs text-muted-foreground">{summary.buyCount} trades</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Total Sell Volume</p>
                            <p className="text-2xl font-bold text-red-500">{formatCurrency(summary.sellVolume)}</p>
                            <p className="text-xs text-muted-foreground">{summary.sellCount} trades</p>
                        </div>
                        <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">Total Fees Paid</p>
                            <p className="font-medium text-lg">{formatCurrency(summary.totalFees)}</p>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                <span>Tx: {formatCurrency(summary.transactionFees)}</span>
                                <span>•</span>
                                <span>FX: {formatCurrency(summary.fxFees)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Chart Card */}
                <Card className="bg-card/50 backdrop-blur-sm md:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Volume Comparison
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Volume']}
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                                />
                                <Bar dataKey="volume" radius={[0, 4, 4, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Operations List */}
            <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Trading History ({operations.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Fees</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {operations.map((tx, i) => {
                                    const isBuy = tx.quantity > 0;
                                    const fees = Math.abs(tx.transactionFee) + Math.abs(tx.autoFxFee);

                                    return (
                                        <TableRow key={`${tx.orderId || 'tx'}-${tx.date.getTime()}-${i}`}>
                                            <TableCell className="whitespace-nowrap w-[120px]">
                                                <div className="flex flex-col">
                                                    <span>{formatDate(tx.date instanceof Date ? tx.date : new Date(tx.date))}</span>
                                                    <span className="text-xs text-muted-foreground">{tx.time}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={isBuy ? 'default' : 'destructive'} className={isBuy ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}>
                                                    {isBuy ? 'BUY' : 'SELL'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col max-w-[200px] sm:max-w-[300px]">
                                                    <span className="font-medium truncate" title={tx.product}>{tx.product}</span>
                                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                                        <span>{tx.isin}</span>
                                                        <span>•</span>
                                                        <span>{tx.exchange}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {Math.abs(tx.quantity)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span>{formatCurrency(tx.price, tx.priceCurrency)}</span>
                                                    {tx.priceCurrency !== 'EUR' && (
                                                        <span className="text-xs text-muted-foreground">FX: {tx.exchangeRate.toFixed(4)}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-red-400 text-xs">
                                                {fees > 0 ? `-${formatCurrency(fees)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                <span className={isBuy ? 'text-red-500' : 'text-green-500'}>
                                                    {isBuy ? '-' : '+'}{formatCurrency(Math.abs(tx.totalEur))}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
