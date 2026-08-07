import React from 'react';
import { US, FR, DE, GB, CA, TR, SG, ES, VN } from 'country-flag-icons/react/3x2';

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

// Render SVG Flag Component cleanly for any country name or code
export const RenderCountryFlag: React.FC<{ country?: string | null }> = ({ country }) => {
    if (!country) return <span className="text-xs">🌐</span>;
    const c = country.trim().toUpperCase();

    if (c === 'UNITED STATES' || c === 'US' || c === 'USA') {
        return <US title="United States" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'FRANCE' || c === 'FR') {
        return <FR title="France" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'GERMANY' || c === 'DE') {
        return <DE title="Germany" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'UNITED KINGDOM' || c === 'UK' || c === 'GB') {
        return <GB title="United Kingdom" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'CANADA' || c === 'CA' || c === 'CAD') {
        return <CA title="Canada" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'TURKEY' || c === 'TR') {
        return <TR title="Turkey" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'SINGAPORE' || c === 'SG') {
        return <SG title="Singapore" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'SPAIN' || c === 'ES') {
        return <ES title="Spain" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    if (c === 'VIETNAM' || c === 'VN') {
        return <VN title="Vietnam" className="w-4 h-3 rounded-2xs inline-block shadow-xs shrink-0 align-middle" />;
    }
    return <span className="text-xs">🌐</span>;
};

// Formats subscriber count e.g. 108000 -> 108K, 1860000 -> 1.70M
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
    const country = kol?.country || 'United States';
    const subs = kol?.subscriber_count;

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
                <div className="font-medium text-slate-900 text-sm leading-snug truncate">
                    {channelLink ? (
                        <a 
                            href={channelLink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hover:text-[var(--accent-color)] hover:underline transition-colors flex items-center gap-1 group w-fit"
                            title={`Open ${name}'s YouTube Channel`}
                        >
                            <span>{name}</span>
                        </a>
                    ) : (
                        <span>{name}</span>
                    )}
                </div>

                {showSubtext && (
                    <div className="text-xs text-slate-500 font-medium flex items-center space-x-1.5 mt-0.5">
                        <span title={country} className="flex items-center gap-1">
                            <RenderCountryFlag country={country} />
                            <span>{country}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 font-semibold">{formattedSubs} subs</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KOLCell;
