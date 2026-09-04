import { Bebas_Neue } from "next/font/google";

/** The celebratory display face shared by every public "recap" surface
 * (auction highlights, shareable roster cards). Declared once here — the
 * documented next/font "font definitions file" pattern — so both pages
 * share a single hosted instance rather than each declaring its own. */
export const displayFont = Bebas_Neue({ weight: "400", subsets: ["latin"] });
