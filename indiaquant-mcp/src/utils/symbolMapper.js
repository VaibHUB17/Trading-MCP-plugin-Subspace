/**
 * Symbol mapper for Indian stock exchanges
 * Converts plain symbols to Yahoo Finance format
 */

import { config } from '../config.js';

/**
 * Map symbol to Yahoo Finance format
 * @param {string} symbol - Plain symbol (e.g., RELIANCE, NIFTY)
 * @param {string} exchange - Exchange: 'NSE' (default) or 'BSE'
 * @returns {string} Yahoo Finance formatted symbol
 */
export function mapSymbol(symbol, exchange = 'NSE') {
  if (!symbol) return '';
  
  const upperSymbol = symbol.toUpperCase().trim();
  
  // Check if it's an index
  if (config.indices[upperSymbol]) {
    return config.indices[upperSymbol];
  }
  
  // Already formatted (has suffix or starts with ^)
  if (upperSymbol.endsWith('.NS') || 
      upperSymbol.endsWith('.BO') || 
      upperSymbol.startsWith('^')) {
    return upperSymbol;
  }
  
  // Apply exchange suffix
  if (exchange === 'BSE') {
    return `${upperSymbol}.BO`;
  } else {
    return `${upperSymbol}.NS`;
  }
}

/**
 * Extract plain symbol from Yahoo Finance format
 * @param {string} yahooSymbol - Yahoo Finance symbol (e.g., RELIANCE.NS)
 * @returns {string} Plain symbol
 */
export function extractPlainSymbol(yahooSymbol) {
  if (!yahooSymbol) return '';
  
  const symbol = yahooSymbol.toUpperCase().trim();
  
  // Remove exchange suffixes
  return symbol
    .replace('.NS', '')
    .replace('.BO', '')
    .replace('^', '');
}

/**
 * Validate if symbol is a valid Indian stock symbol
 * @param {string} symbol - Symbol to validate
 * @returns {boolean}
 */
export function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  
  const cleaned = symbol.trim().toUpperCase();
  
  // Check if it's an index
  if (config.indices[cleaned] || cleaned.startsWith('^')) return true;
  
  // Check if it's a stock symbol (letters, numbers, hyphens, &)
  return /^[A-Z0-9&-]+(\.(NS|BO))?$/.test(cleaned);
}

/**
 * Get display name for symbol
 * @param {string} symbol - Symbol
 * @returns {string} Display name
 */
export function getDisplayName(symbol) {
  const plain = extractPlainSymbol(symbol);
  
  // Map common indices to display names
  const indexNames = {
    'NSEI': 'NIFTY 50',
    'NSEBANK': 'BANK NIFTY',
    'CNXIT': 'NIFTY IT',
    'CNXPHARMA': 'NIFTY PHARMA',
    'CNXAUTO': 'NIFTY AUTO',
    'CNXFMCG': 'NIFTY FMCG',
    'CNXMETAL': 'NIFTY METAL',
    'CNXREALTY': 'NIFTY REALTY',
    'CNXENERGY': 'NIFTY ENERGY',
  };
  
  return indexNames[plain] || plain;
}

/**
 * Batch map multiple symbols
 * @param {string[]} symbols - Array of symbols
 * @param {string} exchange - Exchange (NSE or BSE)
 * @returns {string[]} Array of mapped symbols
 */
export function mapSymbols(symbols, exchange = 'NSE') {
  if (!Array.isArray(symbols)) return [];
  return symbols.map(s => mapSymbol(s, exchange));
}
