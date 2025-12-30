'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Edit2, Trash2, Check, AlertCircle, Settings, RefreshCw, Sparkles, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePortfolioStorage, StoredTickerMappings } from '@/lib/hooks/usePortfolioStorage';

interface TickerMapping {
    isin: string;
    ticker: string;
    name: string;
    verified: boolean;
}

interface TickerMappingPanelProps {
    isOpen: boolean;
    onClose: () => void;
    detectedIsins: { isin: string; name: string }[];
}

/**
 * Ticker Mapping Panel
 * 
 * A modal/sidebar panel where users can manage ISIN → Ticker mappings.
 * Mappings are persisted in localStorage.
 */
export function TickerMappingPanel({ isOpen, onClose, detectedIsins }: TickerMappingPanelProps) {
    const { loadTickerMappings, saveTickerMappings } = usePortfolioStorage();
    const [mappings, setMappings] = useState<TickerMapping[]>([]);
    const [editingIsin, setEditingIsin] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
    const [isReclassifying, setIsReclassifying] = useState(false);
    const [reclassifyMessage, setReclassifyMessage] = useState<string | null>(null);

    // Handle re-classification of all ISINs using Gemini
    const handleReclassify = async (forceRetry = false) => {
        setIsReclassifying(true);
        setReclassifyMessage(null);

        try {
            // Get current ticker mappings
            const stored = loadTickerMappings();
            const isins = mappings.map(m => m.isin);
            const tickerMappings: Record<string, { ticker: string; name: string }> = {};

            for (const m of mappings) {
                if (m.ticker) {
                    tickerMappings[m.isin] = { ticker: m.ticker, name: m.name };
                }
            }

            const response = await fetch('/api/isin-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isins, tickerMappings, forceRetry }),
            });

            if (response.ok) {
                const data = await response.json();
                const classified = data.summary?.classified || 0;
                const retried = data.summary?.retried || 0;
                setReclassifyMessage(`✓ Classified ${classified} items${retried > 0 ? ` (${retried} retried)` : ''}`);
            } else {
                setReclassifyMessage('⚠ Classification failed');
            }
        } catch (error) {
            setReclassifyMessage('⚠ Error during classification');
        } finally {
            setIsReclassifying(false);
        }
    };

    // Handle clearing the classification cache
    const handleClearCache = async () => {
        setIsReclassifying(true);
        try {
            const response = await fetch('/api/isin-metadata', { method: 'DELETE' });
            if (response.ok) {
                setReclassifyMessage('✓ Cache cleared - re-classify to update');
            } else {
                setReclassifyMessage('⚠ Failed to clear cache');
            }
        } catch (error) {
            setReclassifyMessage('⚠ Error clearing cache');
        } finally {
            setIsReclassifying(false);
        }
    };

    // Load mappings from localStorage on mount
    useEffect(() => {
        if (isOpen) {
            const stored = loadTickerMappings();

            // Merge detected ISINs with stored mappings
            const merged: TickerMapping[] = detectedIsins.map(item => {
                const existingMapping = stored[item.isin];
                return {
                    isin: item.isin,
                    name: item.name,
                    ticker: existingMapping?.ticker || '',
                    verified: existingMapping?.verified || false,
                };
            });

            setMappings(merged);
        }
    }, [isOpen, detectedIsins, loadTickerMappings]);

    // Save mappings to localStorage
    const saveMappings = useCallback((updatedMappings: TickerMapping[]) => {
        const toStore: StoredTickerMappings = {};
        updatedMappings.forEach(m => {
            if (m.ticker) {
                toStore[m.isin] = {
                    ticker: m.ticker,
                    name: m.name,
                    verified: m.verified,
                };
            }
        });
        saveTickerMappings(toStore);
    }, [saveTickerMappings]);

    // Start editing a mapping
    const handleEdit = (isin: string, currentTicker: string) => {
        setEditingIsin(isin);
        setEditValue(currentTicker);
    };

    // Save edit
    const handleSaveEdit = (isin: string) => {
        const updated = mappings.map(m =>
            m.isin === isin
                ? { ...m, ticker: editValue.toUpperCase(), verified: editValue.length > 0 }
                : m
        );
        setMappings(updated);
        saveMappings(updated);
        setEditingIsin(null);
        setEditValue('');
    };

    // Cancel edit
    const handleCancelEdit = () => {
        setEditingIsin(null);
        setEditValue('');
    };

    // Delete mapping
    const handleDelete = (isin: string) => {
        const updated = mappings.map(m =>
            m.isin === isin ? { ...m, ticker: '', verified: false } : m
        );
        setMappings(updated);
        saveMappings(updated);
    };

    // Filter mappings
    const filteredMappings = showUnmappedOnly
        ? mappings.filter(m => !m.ticker)
        : mappings;

    const unmappedCount = mappings.filter(m => !m.ticker).length;
    const mappedCount = mappings.filter(m => m.ticker).length;

    if (!isOpen) return null;

    // Use portal to render modal at body level, escaping sticky header stacking context
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] mx-4 my-8 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-bold">Ticker Mapping</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Stats Bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-sm">
                    <div className="flex items-center gap-4">
                        <span className="text-green-500">✓ {mappedCount} mapped</span>
                        <span className="text-amber-500">⚠ {unmappedCount} unmapped</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showUnmappedOnly}
                            onChange={(e) => setShowUnmappedOnly(e.target.checked)}
                            className="rounded"
                        />
                        <span>Show unmapped only</span>
                    </label>
                </div>

                {/* Classification Actions */}
                <div className="px-4 py-3 border-b bg-gradient-to-r from-purple-500/5 to-blue-500/5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Sector Classification</span>
                            {reclassifyMessage && (
                                <span className="text-xs text-muted-foreground">{reclassifyMessage}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReclassify(true)}
                                disabled={isReclassifying || mappings.length === 0}
                                className="gap-1.5"
                            >
                                {isReclassifying ? (
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5" />
                                )}
                                Re-classify All
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearCache}
                                disabled={isReclassifying}
                                className="gap-1.5 text-muted-foreground hover:text-destructive"
                            >
                                <Trash className="h-3.5 w-3.5" />
                                Clear Cache
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Mapping List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {filteredMappings.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            {showUnmappedOnly
                                ? 'All ISINs are mapped! 🎉'
                                : 'No ISINs detected. Upload CSV files first.'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredMappings.map(mapping => (
                                <div
                                    key={mapping.isin}
                                    className={`flex items-center gap-3 p-3 rounded-lg border ${mapping.ticker
                                        ? 'bg-card border-border'
                                        : 'bg-amber-500/10 border-amber-500/30'
                                        }`}
                                >
                                    {/* ISIN & Name */}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {mapping.isin}
                                        </div>
                                        <div className="text-sm truncate">
                                            {mapping.name}
                                        </div>
                                    </div>

                                    {/* Ticker Input/Display */}
                                    {editingIsin === mapping.isin ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                placeholder="e.g., AAPL"
                                                className="w-24 px-2 py-1 text-sm border rounded bg-background"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveEdit(mapping.isin);
                                                    if (e.key === 'Escape') handleCancelEdit();
                                                }}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-green-500"
                                                onClick={() => handleSaveEdit(mapping.isin)}
                                            >
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={handleCancelEdit}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            {mapping.ticker ? (
                                                <span className="font-mono font-bold text-primary">
                                                    {mapping.ticker}
                                                </span>
                                            ) : (
                                                <span className="text-amber-500 text-sm flex items-center gap-1">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Not set
                                                </span>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => handleEdit(mapping.isin, mapping.ticker)}
                                            >
                                                <Edit2 className="h-3 w-3" />
                                            </Button>
                                            {mapping.ticker && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive"
                                                    onClick={() => handleDelete(mapping.isin)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                        Mappings are saved automatically to your browser.
                    </p>
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Done
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

/**
 * Settings Button Component
 * Renders a button that opens the Ticker Mapping Panel
 */
interface SettingsButtonProps {
    detectedIsins: { isin: string; name: string }[];
}

export function SettingsButton({ detectedIsins }: SettingsButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { loadTickerMappings } = usePortfolioStorage();

    // Count unmapped ISINs
    const stored = loadTickerMappings();
    const unmappedCount = detectedIsins.filter(item => !stored[item.isin]?.ticker).length;

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="gap-1 relative"
            >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
                {unmappedCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-500 text-[10px] font-bold flex items-center justify-center text-white">
                        {unmappedCount}
                    </span>
                )}
            </Button>

            <TickerMappingPanel
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                detectedIsins={detectedIsins}
            />
        </>
    );
}
