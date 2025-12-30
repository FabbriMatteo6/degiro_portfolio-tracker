'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Sparkline, generateMockSparklineData } from '@/components/Sparkline';

interface Position {
    product: string;
    isin: string;
    quantity: number;
    lastPrice: number;
    value: number;
    costBasis: number;
    gain: number;
    gainPercent: number;
    currency: string;
}

interface PositionsTableProps {
    positions: Position[];
    sparklineData?: Record<string, number[]>; // ISIN -> 30-day prices
}

export function PositionsTable({ positions, sparklineData = {} }: PositionsTableProps) {
    const sortedPositions = [...positions].sort((a, b) => b.value - a.value);

    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle>Holdings</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Asset</TableHead>
                                <TableHead className="text-center">30D Trend</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead className="text-right">Price</TableHead>
                                <TableHead className="text-right">Value</TableHead>
                                <TableHead className="text-right">Gain/Loss</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedPositions.map((pos) => {
                                // Use real sparkline data if available, otherwise generate mock
                                let prices = sparklineData[pos.isin];
                                if (!prices || prices.length < 2) {
                                    const trend = pos.gainPercent > 5 ? 'up' : pos.gainPercent < -5 ? 'down' : 'neutral';
                                    prices = generateMockSparklineData(pos.lastPrice, 0.02, 30, trend);
                                }

                                return (
                                    <TableRow key={pos.isin || pos.product}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium truncate max-w-[200px]">{pos.product}</p>
                                                <p className="text-xs text-muted-foreground">{pos.isin}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Sparkline data={prices} width={100} height={28} />
                                        </TableCell>
                                        <TableCell className="text-right">{pos.quantity}</TableCell>
                                        <TableCell className="text-right">
                                            {formatCurrency(pos.lastPrice, pos.currency)}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatCurrency(pos.value)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className={`flex items-center justify-end gap-1 ${pos.gain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {pos.gain >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                                <span>{formatCurrency(pos.gain)}</span>
                                                <span className="text-xs">({formatPercent(pos.gainPercent / 100)})</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

interface DividendEntry {
    date: Date;
    product: string;
    grossAmount: number;
    withholdingTax: number;
    netAmount: number;
    currency: string;
}

interface DividendsTableProps {
    dividends: DividendEntry[];
}

export function DividendsTable({ dividends }: DividendsTableProps) {
    const totalGross = dividends.reduce((sum, d) => sum + d.grossAmount, 0);
    const totalTax = dividends.reduce((sum, d) => sum + d.withholdingTax, 0);
    const totalNet = dividends.reduce((sum, d) => sum + d.netAmount, 0);

    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Dividends</CardTitle>
                <Badge variant="secondary" className="text-green-500">
                    Total: {formatCurrency(totalNet)}
                </Badge>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Asset</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Tax</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dividends.slice(0, 20).map((div, index) => (
                                <TableRow key={`${div.date.toISOString()}-${index}`}>
                                    <TableCell className="text-muted-foreground">
                                        {div.date.toLocaleDateString('it-IT')}
                                    </TableCell>
                                    <TableCell className="truncate max-w-[150px]">{div.product}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(div.grossAmount, div.currency)}</TableCell>
                                    <TableCell className="text-right text-red-500">-{formatCurrency(div.withholdingTax, div.currency)}</TableCell>
                                    <TableCell className="text-right font-medium text-green-500">{formatCurrency(div.netAmount, div.currency)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                {dividends.length > 20 && (
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                        Showing first 20 of {dividends.length} dividend payments
                    </p>
                )}
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-sm text-muted-foreground">Total Gross</p>
                        <p className="font-bold">{formatCurrency(totalGross)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Total Tax</p>
                        <p className="font-bold text-red-500">-{formatCurrency(totalTax)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Total Net</p>
                        <p className="font-bold text-green-500">{formatCurrency(totalNet)}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

interface FeeEntry {
    date: Date;
    description: string;
    amount: number;
    type: string;
}

interface FeesTableProps {
    fees: FeeEntry[];
}

export function FeesTable({ fees }: FeesTableProps) {
    const byType = fees.reduce((acc, fee) => {
        acc[fee.type] = (acc[fee.type] || 0) + fee.amount;
        return acc;
    }, {} as Record<string, number>);

    const total = Object.values(byType).reduce((sum, val) => sum + val, 0);

    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fees & Costs</CardTitle>
                <Badge variant="destructive">
                    Total: {formatCurrency(total)}
                </Badge>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    {Object.entries(byType).map(([type, amount]) => (
                        <div key={type} className="p-3 rounded-lg bg-muted/50 text-center">
                            <p className="text-xs text-muted-foreground capitalize">{type}</p>
                            <p className="font-bold text-red-500">{formatCurrency(amount)}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
