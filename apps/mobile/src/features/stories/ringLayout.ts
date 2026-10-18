/** Geometry shared by the story rings, their skeleton and the row that holds them. */
export const RING_SIZE = 76;
const LABEL_GAP = 6;
const LABEL_LINES = 2;
const LABEL_LINE_HEIGHT = 18;
/** Labels grow with Dynamic Type up to this factor; past it the text is capped, not clipped. */
export const LABEL_MAX_FONT_SCALE = 1.3;

/** The label's height: two lines that grow with the font scale (capped), never clipped. */
export function storyLabelHeight(fontScale: number): number {
  const scale = Math.min(Math.max(fontScale, 1), LABEL_MAX_FONT_SCALE);
  return Math.ceil(LABEL_LINES * LABEL_LINE_HEIGHT * scale);
}

/** Height of one ring with its label: the real row and its skeleton both reserve exactly this. */
export function storyRingHeight(fontScale: number): number {
  return RING_SIZE + LABEL_GAP + storyLabelHeight(fontScale);
}

/** Top padding of the row. */
export const ROW_PAD_TOP = 16;
export const LABEL_MARGIN_TOP = LABEL_GAP;
