import { useDepth, withAlpha } from '@booking/ui';

/** The canvas's stage tokens (--stage, --chip, --grey ...) for one colour scheme. */
export interface StagePalette {
  tint: string;
  soft: string;
  soft2: string;
  stageTop: string;
  stageBottom: string;
  stageContent: string;
  chip: string;
  chipShadow: string;
  grey: string;
  greyText: string;
  label: string;
  secondary: string;
  inset: string;
  hatch: string;
  bubbleIn: string;
  bubbleOut: string;
  bubbleText: string;
  green: string;
  greenText: string;
  red: string;
}

const LIGHT = {
  stageTop: '#EEF4FE',
  stageBottom: '#DCE8FA',
  stageContent: '#E6EFFC',
  chip: '#FFFFFF',
  chipShadow:
    '0 0 0 0.5px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.10), 0 3px 8px -2px rgba(16,24,40,0.12)',
  grey: '#E4E5EA',
  greyText: '#7D7D84',
  inset: '#E9EAEF',
  hatch: 'rgba(0,0,0,0.07)',
  bubbleIn: '#FFFFFF',
  bubbleOut: '#DCF8C6',
  bubbleText: '#111111',
  greenText: '#1B7F38',
};
const DARK = {
  stageTop: '#17253D',
  stageBottom: '#101B2E',
  stageContent: '#17253D',
  chip: 'rgba(255,255,255,0.12)',
  chipShadow: '0 0 0 0.5px rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.4)',
  grey: 'rgba(120,120,128,0.30)',
  greyText: '#9A9AA2',
  inset: '#0F1014',
  hatch: 'rgba(255,255,255,0.10)',
  bubbleIn: '#2A2B31',
  bubbleOut: '#1F4D32',
  bubbleText: '#F2F2F7',
  greenText: '#4CD964',
};

/** Theme-aware colours for the explainer thumbnails (light and dark, tint from the business). */
export function useStagePalette(): StagePalette {
  const depth = useDepth();
  const scheme = depth.scheme === 'dark' ? DARK : LIGHT;
  return {
    ...scheme,
    tint: depth.colors.tint,
    soft: withAlpha(depth.colors.tint, 0.14),
    soft2: withAlpha(depth.colors.tint, 0.26),
    label: depth.colors.label,
    secondary: depth.colors.secondary,
    green: '#2DB45B',
    red: '#D70015',
  };
}
