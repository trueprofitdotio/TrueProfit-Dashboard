import React from 'react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    activeWhen?: boolean;
    destructive?: boolean;
    separatorBefore?: boolean;
}

interface ActionMenuProps {
    anchorRect: DOMRect;
    items: ActionMenuItem[];
    onRequestClose: () => void;
    menuRef?: React.RefObject<HTMLDivElement>;
}

const MENU_WIDTH = 208;

const ActionMenu: React.FC<ActionMenuProps> = ({ anchorRect, items, onRequestClose, menuRef }) => {
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
    const estimatedHeight = items.length * 34 + 12;
    const openUpward = anchorRect.bottom + estimatedHeight > viewportH && anchorRect.top > estimatedHeight;

    const style: React.CSSProperties = {
        position: 'fixed',
        left: Math.min(anchorRect.right - MENU_WIDTH, (typeof window !== 'undefined' ? window.innerWidth : 0) - MENU_WIDTH - 8),
        top: openUpward ? undefined : anchorRect.bottom + 6,
        bottom: openUpward ? (viewportH - anchorRect.top + 6) : undefined,
        width: MENU_WIDTH,
    };

    return createPortal(
        <div
            ref={menuRef}
            style={style}
            className="z-[999999] bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 animate-in fade-in zoom-in-95 duration-150 font-sans"
        >
            {items.map((item) => (
                <button
                    key={item.key}
                    onClick={() => { item.onClick(); onRequestClose(); }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors ${item.separatorBefore ? 'mt-1 border-t border-slate-100 pt-2.5' : ''} ${item.destructive
                            ? 'text-rose-600 hover:bg-rose-50'
                            : item.activeWhen
                                ? 'text-slate-900 bg-slate-50 font-semibold'
                                : 'text-slate-700 hover:bg-slate-50'
                        }`}
                >
                    <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                </button>
            ))}
        </div>,
        document.body
    );
};

export default ActionMenu;
