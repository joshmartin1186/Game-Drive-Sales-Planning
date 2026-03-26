/**
 * Outlet country detection utility
 * Detects country from domain TLD or known outlet mappings
 */

// TLD → country mapping (highest priority after known outlets)
const TLD_COUNTRY_MAP: Record<string, string> = {
  '.de': 'Germany', '.fr': 'France', '.nl': 'Netherlands', '.es': 'Spain',
  '.it': 'Italy', '.pt': 'Portugal', '.br': 'Brazil', '.jp': 'Japan',
  '.kr': 'South Korea', '.cn': 'China', '.ru': 'Russia', '.pl': 'Poland',
  '.cz': 'Czech Republic', '.se': 'Sweden', '.no': 'Norway', '.dk': 'Denmark',
  '.fi': 'Finland', '.at': 'Austria', '.ch': 'Switzerland', '.be': 'Belgium',
  '.uk': 'United Kingdom', '.co.uk': 'United Kingdom',
  '.au': 'Australia', '.ca': 'Canada', '.in': 'India', '.mx': 'Mexico',
  '.ar': 'Argentina', '.cl': 'Chile', '.co': 'Colombia',
  '.tw': 'Taiwan', '.th': 'Thailand', '.id': 'Indonesia',
  '.tr': 'Turkey', '.gr': 'Greece', '.hu': 'Hungary', '.ro': 'Romania',
  '.bg': 'Bulgaria', '.hr': 'Croatia', '.sk': 'Slovakia', '.si': 'Slovenia',
  '.ie': 'Ireland', '.nz': 'New Zealand', '.sg': 'Singapore',
  '.hk': 'Hong Kong', '.ph': 'Philippines', '.my': 'Malaysia',
  '.vn': 'Vietnam', '.ua': 'Ukraine', '.il': 'Israel',
  '.ae': 'UAE', '.sa': 'Saudi Arabia',
  '.lt': 'Lithuania', '.lv': 'Latvia', '.ee': 'Estonia',
}

// Known gaming outlet domains → country
const KNOWN_OUTLET_COUNTRIES: Record<string, string> = {
  // United States
  'ign.com': 'United States', 'gamespot.com': 'United States', 'kotaku.com': 'United States',
  'pcgamer.com': 'United States', 'polygon.com': 'United States', 'theverge.com': 'United States',
  'destructoid.com': 'United States', 'dualshockers.com': 'United States',
  'gameinformer.com': 'United States', 'gamesbeat.com': 'United States',
  'toucharcade.com': 'United States', 'shacknews.com': 'United States',
  'gamerant.com': 'United States', 'screenrant.com': 'United States',
  'thegamer.com': 'United States', 'comicbook.com': 'United States',
  'cbr.com': 'United States', 'wccftech.com': 'United States',
  'gamingbolt.com': 'United States', 'twinfinite.net': 'United States',
  'siliconera.com': 'United States', 'hardcoregamer.com': 'United States',
  'mp1st.com': 'United States', 'arstechnica.com': 'United States',
  'engadget.com': 'United States', 'wired.com': 'United States',
  'forbes.com': 'United States', 'savingcontent.com': 'United States',
  'dexerto.com': 'United States', 'metacritic.com': 'United States',
  'opencritic.com': 'United States', 'neoseeker.com': 'United States',
  'gamespace.com': 'United States',

  // United Kingdom
  'eurogamer.net': 'United Kingdom', 'rockpapershotgun.com': 'United Kingdom',
  'pcgamesn.com': 'United Kingdom', 'gamesradar.com': 'United Kingdom',
  'gamesindustry.biz': 'United Kingdom', 'vg247.com': 'United Kingdom',
  'videogameschronicle.com': 'United Kingdom', 'techradar.com': 'United Kingdom',
  'pocketgamer.com': 'United Kingdom', 'pushsquare.com': 'United Kingdom',
  'nintendolife.com': 'United Kingdom', 'purexbox.com': 'United Kingdom',
  'gamespew.com': 'United Kingdom', 'gamegrin.com': 'United Kingdom',
  'escapistmagazine.com': 'United Kingdom', 'rpgsite.net': 'United Kingdom',
  'noisypixel.net': 'United Kingdom',

  // Germany
  '4players.de': 'Germany', 'gamestar.de': 'Germany', 'pcgames.de': 'Germany',
  'gamepro.de': 'Germany', 'spieletipps.de': 'Germany', 'golem.de': 'Germany',
  'gamesunit.de': 'Germany', 'gamolution.de': 'Germany', 'maniac.de': 'Germany',

  // France
  'jeuxvideo.com': 'France', 'gamekult.com': 'France', 'gameblog.fr': 'France',
  'jvfrance.com': 'France', 'gamalive.com': 'France',

  // Italy
  'multiplayer.it': 'Italy', 'everyeye.it': 'Italy',

  // Spain
  '3djuegos.com': 'Spain', 'vandal.elespanol.com': 'Spain', 'meristation.com': 'Spain',

  // Netherlands
  'gamer.nl': 'Netherlands', 'insidegamer.nl': 'Netherlands',
  'tweakers.net': 'Netherlands', 'power-unlimited.nl': 'Netherlands',
  'gamekings.tv': 'Netherlands', 'dailynintendo.nl': 'Netherlands',
  'gameliner.nl': 'Netherlands', 'gamestic.nl': 'Netherlands',
  'fok.nl': 'Netherlands', 'drimble.nl': 'Netherlands',

  // Belgium
  'gamequarter.be': 'Belgium', 'beyondgaming.be': 'Belgium',

  // Switzerland
  'games.ch': 'Switzerland',

  // Japan
  'famitsu.com': 'Japan', '4gamer.net': 'Japan', 'gamespark.jp': 'Japan',
  'gamewith.jp': 'Japan', 'denfaminicogamer.jp': 'Japan', 'doope.jp': 'Japan',
  'dengekionline.com': 'Japan',

  // South Korea
  'keylol.com': 'South Korea',

  // Russia
  'stopgame.ru': 'Russia', 'igromania.ru': 'Russia', 'mmo13.ru': 'Russia',
  'goha.ru': 'Russia', 'gameguru.ru': 'Russia',

  // Croatia
  'bug.hr': 'Croatia', 'hcl.hr': 'Croatia',

  // Brazil
  'theenemy.com.br': 'Brazil', 'tecmundo.com.br': 'Brazil',

  // Gamepressure is Polish
  'gamepressure.com': 'Poland',
}

/**
 * Detect outlet country from its domain.
 *
 * Priority:
 * 1. Known outlet domain mapping (most accurate)
 * 2. TLD-based detection (compound TLDs like .co.uk checked first)
 * 3. For .com/.net/.org/.io etc. not in known list → 'International'
 */
export function detectOutletCountry(domain: string | null): string {
  if (!domain) return 'International'

  const cleanDomain = domain.replace(/^www\./, '').toLowerCase()

  // 1. Check known outlet domains
  if (KNOWN_OUTLET_COUNTRIES[cleanDomain]) {
    return KNOWN_OUTLET_COUNTRIES[cleanDomain]
  }

  // Also check parent domain for subdomains (e.g., latam.ign.com → ign.com)
  const parts = cleanDomain.split('.')
  if (parts.length > 2) {
    const parentDomain = parts.slice(1).join('.')
    if (KNOWN_OUTLET_COUNTRIES[parentDomain]) {
      return KNOWN_OUTLET_COUNTRIES[parentDomain]
    }
  }

  // 2. Check compound TLDs first (e.g., .co.uk, .com.br)
  if (parts.length >= 3) {
    const compoundTld = '.' + parts.slice(-2).join('.')
    if (TLD_COUNTRY_MAP[compoundTld]) {
      return TLD_COUNTRY_MAP[compoundTld]
    }
  }

  // 3. Check simple TLD
  const simpleTld = '.' + parts[parts.length - 1]
  if (TLD_COUNTRY_MAP[simpleTld]) {
    return TLD_COUNTRY_MAP[simpleTld]
  }

  // 4. Generic TLDs default to International
  return 'International'
}
