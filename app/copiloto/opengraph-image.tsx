import { ogImage, ogSize, ogContentType } from "../lib/og";

export const runtime = "edge";
export const alt = "Loreado.IA — El copiloto de IA que RRHH no quiere que uses";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage();
}
