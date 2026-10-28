export function contrastText(hex: string): string {
  const component = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  return .2126 * component(1) + .7152 * component(3) + .0722 * component(5) > .179 ? '#111111' : '#ffffff';
}
