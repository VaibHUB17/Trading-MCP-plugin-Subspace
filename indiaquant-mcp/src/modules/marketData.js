/**
 * Market Data Module
 * Fetches live prices and historical OHLC data using yahoo-finance2
 */

import yahooFinance from 'yahoo-finance2';
import { mapSymbol, isValidSymbol } from '../utils/symbolMapper.js';
import cache from '../utils/cache.js';
import { config } from '../config.js';

/**
 * Check if market is currently open (IST timezone)
 */
export function isMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  
  const day = istTime.getUTCDay();
  const hour = istTime.getUTCHours();
  const minute = istTime.getUTCMinutes();
  
  // Weekend check (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) return false;
  
  // Market hours: 9:15 AM to 3:30 PM IST
  const currentMinutes = hour * 60 + minute;
  const marketStart = config.marketHours.start.hour * 60 + config.marketHours.start.minute;
  const marketEnd = config.marketHours.end.hour * 60 + config.marketHours.end.minute;
  
  return currentMinutes >= marketStart && currentMinutes <= marketEnd;
}

/**
 * Fetch live price for a symbol
 * @param {string} symbol - Stock symbol (e.g., RELIANCE, TCS)
 * @returns {Promise<Object>} Price data
 */
export async function fetchLivePrice(symbol) {
  try {
    if (!isValidSymbol(symbol)) {
      throw new Error(`Invalid symbol: ${symbol}`);
    }

    const yahooSymbol = mapSymbol(symbol);
    const cacheKey = `price:${yahooSymbol}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from Yahoo Finance
    const quote = await yahooFinance.quoteSummary(yahooSymbol, { 
      modules: ['price'],
      timeout: 3000  // 10s → 3s (fail faster, retry faster)
    });
    const priceData = quote.price;
    
    if (!priceData || !priceData.regularMarketPrice) {
      throw new Error(`No data available for ${symbol}`);
    }

    const result = {
      symbol: symbol,
      yahooSymbol: yahooSymbol,
      price: priceData.regularMarketPrice || 0,
      change: priceData.regularMarketChange || 0,
      changePct: priceData.regularMarketChangePercent || 0,
      volume: priceData.regularMarketVolume || 0,
      high: priceData.regularMarketDayHigh || priceData.regularMarketPrice || 0,
      low: priceData.regularMarketDayLow || priceData.regularMarketPrice || 0,
      open: priceData.regularMarketOpen || priceData.regularMarketPrice || 0,
      previousClose: priceData.regularMarketPreviousClose || priceData.regularMarketPrice || 0,
      marketCap: priceData.marketCap || 0,
      fiftyTwoWeekHigh: priceData.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: priceData.fiftyTwoWeekLow || 0,
      timestamp: new Date().toISOString(),
      marketOpen: isMarketOpen(),
      currency: priceData.currency || 'INR',
    };

    // If market is closed, add a note
    if (!result.marketOpen) {
      result.note = 'Market is closed. Showing last traded price.';
    }

    // Cache the result
    cache.set(cacheKey, result, config.cacheTTL.livePrice);
    
    return result;
  } catch (error) {
    console.error(`Error fetching live price for ${symbol}:`, error.message);
    throw new Error(`Failed to fetch price for ${symbol}: ${error.message}`);
  }
}

/**
 * Fetch historical OHLC data
 * @param {string} symbol - Stock symbol
 * @param {string} period - Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)
 * @param {string} interval - Data interval (1m, 5m, 15m, 1h, 1d, 1wk, 1mo)
 * @returns {Promise<Array>} Array of OHLC data
 */
export async function fetchOHLC(symbol, period = '1mo', interval = '1d') {
  try {
    if (!isValidSymbol(symbol)) {
      throw new Error(`Invalid symbol: ${symbol}`);
    }

    const yahooSymbol = mapSymbol(symbol);
    const cacheKey = `ohlc:${yahooSymbol}:${period}:${interval}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch historical data
    const result = await yahooFinance.chart(yahooSymbol, {
      period1: getPeriodStartDate(period),
      interval: interval,
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      throw new Error(`No historical data available for ${symbol}`);
    }

    // Format the data
    const ohlcData = result.quotes
      .filter(q => q.open && q.high && q.low && q.close) // Filter out incomplete data
      .map(quote => ({
        date: quote.date ? new Date(quote.date).toISOString() : null,
        timestamp: quote.date ? Math.floor(quote.date.getTime() / 1000) : null,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.close,
        volume: quote.volume || 0,
      }));

    if (ohlcData.length === 0) {
      throw new Error(`No valid OHLC data for ${symbol}`);
    }

    // Cache the result
    cache.set(cacheKey, ohlcData, config.cacheTTL.ohlc);
    
    return ohlcData;
  } catch (error) {
    console.error(`Error fetching OHLC for ${symbol}:`, error.message);
    throw new Error(`Failed to fetch OHLC data for ${symbol}: ${error.message}`);
  }
}

/**
 * Get period start date based on period string
 */
function getPeriodStartDate(period) {
  const now = new Date();
  const periodMap = {
    '1d': 1,
    '5d': 5,
    '1mo': 30,
    '3mo': 90,
    '6mo': 180,
    '1y': 365,
    '2y': 730,
    '5y': 1825,
    'max': 3650,
  };

  const days = periodMap[period] || 30;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return startDate;
}

/**
 * Fetch multiple symbols at once
 * @param {string[]} symbols - Array of symbols
 * @returns {Promise<Object>} Object with symbol as key and price data as value
 */
export async function fetchMultiplePrices(symbols) {
  try {
    const results = {};
    const promises = symbols.map(async (symbol) => {
      try {
        results[symbol] = await fetchLivePrice(symbol);
      } catch (error) {
        results[symbol] = { error: true, message: error.message };
      }
    });

    await Promise.all(promises);
    return results;
  } catch (error) {
    throw new Error(`Failed to fetch multiple prices: ${error.message}`);
  }
}

/**
 * Get basic company info
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Company information
 */
export async function fetchCompanyInfo(symbol) {
  try {
    const yahooSymbol = mapSymbol(symbol);
    const cacheKey = `info:${yahooSymbol}`;
    
    // Check cache (24 hour TTL for company info)
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const quote = await yahooFinance.quoteSummary(yahooSymbol, {
      modules: ['price', 'summaryDetail']
    });

    const result = {
      symbol: symbol,
      name: quote.price?.longName || quote.price?.shortName || symbol,
      sector: quote.summaryDetail?.sector || 'N/A',
      industry: quote.summaryDetail?.industry || 'N/A',
      marketCap: quote.price?.marketCap || 0,
      currency: quote.price?.currency || 'INR',
    };

    cache.set(cacheKey, result, 86400); // 24 hours
    return result;
  } catch (error) {
    console.error(`Error fetching company info for ${symbol}:`, error.message);
    return {
      symbol: symbol,
      name: symbol,
      sector: 'N/A',
      industry: 'N/A',
      error: error.message
    };
  }
}
