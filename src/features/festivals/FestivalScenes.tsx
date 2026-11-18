/**
 * A scene for every festival that had only an emoji (18 Nov 2026, the user's
 * request: "each festival should contain character or proper presentation of
 * festival celebrating it"). FestivalArt merges these with its five originals.
 */

import type { Draw } from './festival-art-kit'
import { SCENES_A } from './festival-scenes-a'
import { SCENES_B } from './festival-scenes-b'

export const SCENES: Record<string, { draw: Draw; viewBox: string; label: string }> = { ...SCENES_A, ...SCENES_B }
