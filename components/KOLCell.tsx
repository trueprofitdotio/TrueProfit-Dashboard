import React from 'react';

export interface KolData {
    id?: string;
    name: string;
    email?: string | null;
    country?: string | null;
    subscriber_count?: string | number | null;
    channel_link?: string | null;
    avatar_url?: string | null;
}

interface KOLCellProps {
    kol?: KolData | null;
    fallbackName?: string;
    showSubtext?: boolean;
    className?: string;
}

// Country code/name to flag emoji map
export const getCountryFlag = (country?: string | null): string => {
    if (!country) return '🌐';
    const c = country.trim().toUpperCase();
    if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return '🇺🇸';
    if (c === 'FR' || c === 'FRANCE') return '🇫🇷';
    if (c === 'DE' || c === 'GERMANY') return '🇩🇪';
    if (c === 'UK' || c === 'GB' || c === 'UNITED KINGDOM') return '🇬🇧';
    if (c === 'CA' || c === 'CAD' || c === 'CANADA') return '🇨🇦';
    if (c === 'TR' || c === 'TURKEY') return '🇹🇷';
    if (c === 'SG' || c === 'SINGAPORE') return '🇸🇬';
    if (c === 'ES' || c === 'SPAIN') return '🇪🇸';
    if (c === 'VN' || c === 'VIETNAM') return '🇻🇳';
    return '🌐';
};

// Formats subscriber count e.g. 108000 -> 108K, 1860000 -> 1.86M
export const formatSubscribers = (subs?: string | number | null): string => {
    if (subs === undefined || subs === null || subs === '') return '—';
    const num = typeof subs === 'number' ? subs : parseFloat(String(subs).replace(/,/g, ''));
    if (isNaN(num) || num === 0) return String(subs);
    
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 2) + 'M';
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1) + 'K';
    }
    return new Intl.NumberFormat('en-US').format(num);
};

export const KOLCell: React.FC<KOLCellProps> = ({ 
    kol, 
    fallbackName = 'Unknown KOL', 
    showSubtext = true,
    className = '' 
}) => {
    const name = kol?.name || fallbackName;
    const avatarUrl = kol?.avatar_url;
    const channelLink = kol?.channel_link;
    const country = kol?.country;
    const subs = kol?.subscriber_count;

    const flag = getCountryFlag(country);
    const formattedSubs = formatSubscribers(subs);

    // Initials for avatar fallback
    const initials = name
        .split(' ')
        .map(n => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'K';

    return (
        <div className={`flex items-center space-x-3 ${className}`}>
            {/* Avatar Image or Fallback Circle */}
            <div className="shrink-0 relative">
                {avatarUrl ? (
                    <img 
                        src={avatarUrl} 
                        alt={name} 
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs"
                        onError={(e) => {
                            // On image error, hide image and show initials fallback
                            (e.target as HTMLElement).style.display = 'none';
                            const fallbackEl = (e.target as HTMLElement).nextElementSibling;
                            if (fallbackEl) fallbackEl.classList.remove('hidden');
                        }}
                    />
                ) : null}
                <div className={`w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold text-xs flex items-center justify-center border border-slate-200 shadow-xs ${avatarUrl ? 'hidden' : ''}`}>
                    {initials}
                </div>
            </div>

            {/* KOL Name & Metadata */}
            <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 text-sm leading-snug truncate">
                    {channelLink ? (
                        <a 
                            href={channelLink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hover:text-[var(--accent-color)] hover:underline transition-colors flex items-center gap-1 group w-fit"
                            title={`Open ${name}'s YouTube Channel`}
                        >
                            <span>{name}</span>
                            <svg className="w-3 h-3 text-slate-400 group-hover:text-[var(--accent-color)] opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    ) : (
                        <span>{name}</span>
                    )}
                </div>

                {showSubtext && (
                    <div className="text-xs text-slate-500 font-medium flex items-center space-x-1.5 mt-0.5">
                        <span title={country || 'Location'}>{flag} {country || 'US'}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 font-semibold">{formattedSubs} subs</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KOLCell;
