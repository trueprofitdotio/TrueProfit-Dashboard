import React from 'react';
import { Globe, Users } from 'lucide-react';
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

// One lookup drives both the flag and the compact code shown beside it, so the
// meta row stays a fixed width instead of stretching on "United Kingdom".
const COUNTRIES: Record<string, { code: string; Flag: React.ComponentType<{ className?: string }> }> = {
    'UNITED STATES': { code: 'US', Flag: US }, US: { code: 'US', Flag: US }, USA: { code: 'US', Flag: US },
    FRANCE: { code: 'FR', Flag: FR }, FR: { code: 'FR', Flag: FR },
    GERMANY: { code: 'DE', Flag: DE }, DE: { code: 'DE', Flag: DE },
    'UNITED KINGDOM': { code: 'UK', Flag: GB }, UK: { code: 'UK', Flag: GB }, GB: { code: 'UK', Flag: GB },
    CANADA: { code: 'CA', Flag: CA }, CA: { code: 'CA', Flag: CA }, CAD: { code: 'CA', Flag: CA },
    TURKEY: { code: 'TR', Flag: TR }, TR: { code: 'TR', Flag: TR },
    SINGAPORE: { code: 'SG', Flag: SG }, SG: { code: 'SG', Flag: SG },
    SPAIN: { code: 'ES', Flag: ES }, ES: { code: 'ES', Flag: ES },
    VIETNAM: { code: 'VN', Flag: VN }, VN: { code: 'VN', Flag: VN },
};

const lookupCountry = (country?: string | null) =>
    country ? COUNTRIES[country.trim().toUpperCase()] : undefined;

// Render SVG Flag Component cleanly for any country name or code
export const RenderCountryFlag: React.FC<{ country?: string | null }> = ({ country }) => {
    const match = lookupCountry(country);
    const wrapperClass = "w-[15px] h-[11px] shrink-0 overflow-hidden rounded-[2px] border border-black/10 inline-flex items-center justify-center";

    if (!match) {
        return (
            <span className={`${wrapperClass} bg-[var(--tp-surface-sunken)]`}>
                <Globe className="h-2.5 w-2.5 text-[var(--tp-faint)]" strokeWidth={2} />
            </span>
        );
    }
    return <span className={wrapperClass}><match.Flag /></span>;
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
    const countryCode = lookupCountry(country)?.code;

    // Initials for avatar fallback
    const initials = name
        .split(' ')
        .map(n => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'K';

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            {/* Avatar Image or Fallback Circle */}
            <div className="relative shrink-0">
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 shrink-0 rounded-full border border-[var(--tp-rule-panel)] object-cover"
                        onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                            const fallbackEl = (e.target as HTMLElement).nextElementSibling;
                            if (fallbackEl) fallbackEl.classList.remove('hidden');
                        }}
                    />
                ) : null}
                <div className={`h-9 w-9 items-center justify-center rounded-full border border-[var(--tp-accent-rule)] bg-[var(--tp-accent-soft)] text-[11px] font-semibold tracking-tight text-[var(--tp-accent-ink)] ${avatarUrl ? 'hidden' : 'flex'}`}>
                    {initials}
                </div>
            </div>

            {/* Name on one line, metrics on a single aligned rail below it. */}
            <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold leading-tight text-[var(--tp-ink)]">
                    {channelLink ? (
                        <a
                            href={channelLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-fit max-w-full truncate hover:text-[var(--tp-accent-ink)] hover:underline"
                            title={`Open ${name} on YouTube`}
                        >
                            {name}
                        </a>
                    ) : (
                        <span>{name}</span>
                    )}
                </div>

                {showSubtext && (
                    <div className="mt-[3px] flex items-center gap-2 text-[11.5px] font-medium leading-none text-[var(--tp-meta)]">
                        <span className="flex shrink-0 items-center gap-1.5" title={country}>
                            <RenderCountryFlag country={country} />
                            <span className="uppercase tracking-wide">{countryCode || country}</span>
                        </span>
                        <span className="h-3 w-px shrink-0 bg-[var(--tp-rule)]" aria-hidden="true" />
                        <span className="flex shrink-0 items-center gap-1" title={`${formattedSubs} subscribers`}>
                            <Users className="h-3 w-3 text-[var(--tp-faint)]" strokeWidth={2} />
                            <span className="tabular-nums text-[var(--tp-ink-2)]">{formattedSubs}</span>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KOLCell;
