// The look plan, in one place. Emberworks is a foundry yard at dusk: cold blue-grey
// steel, warm amber furnace light, hazard yellow as the one loud accent. Every colour
// in the game and the page comes from these six names.
export const PALETTE = {
  canvas: '#17191d',
  surface: '#20242a',
  hairline: '#2e343d',
  ink: '#ece7db',
  muted: '#9aa3ab',
  accent: '#f5a623',
  ember: '#ff5a1f',
  steel: '#4a545e',
};

export function shade(name) {
  return PALETTE[name];
}
