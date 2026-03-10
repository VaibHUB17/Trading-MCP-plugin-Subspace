/**
 * Options Analyzer Module
 * Options chain fetching, Greeks calculation, max pain, and unusual activity detection
 */

import yahooFinance from 'yahoo-finance2';
import { mapSymbol } from '../utils/symbolMapper.js';
import { 
  calculateAllGreeks, 
  calculateImpliedVolatility 
} from '../utils/blackScholes.js';
import { fetchOHLC } from './marketData.js';
import { config } from '../config.js';
import cache from '../utils/cache.js';

/**
 * Calculate annualized historical volatility
 * @param {number[]} prices - Array of historical prices
 * @returns {number} Annualized volatility
 */
function calculateHistoricalVolatility(prices) {
  if (prices.length < 2) return 0.3; // Default 30%

  // Calculate daily returns
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  // Calculate standard deviation
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailyVolatility = Math.sqrt(variance);

  // Annualize (assuming 252 trading days)
  return dailyVolatility * Math.sqrt(252);
}

/**
 * Fetch options chain for a symbol
 * @param {string} symbol - Stock symbol
 * @param {string} expiry - Expiry date (optional, YYYY-MM-DD format)
 * @returns {Promise<Object>} Options chain data
 */
export async function fetchOptionsChain(symbol, expiry = null) {
  try {
    const yahooSymbol = mapSymbol(symbol);
    const cacheKey = `options:${yahooSymbol}:${expiry || 'nearest'}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch options data
    const optionsData = await yahooFinance.options(yahooSymbol, {
      date: expiry || undefined
    });

    if (!optionsData || (!optionsData.calls && !optionsData.puts)) {
      throw new Error(`No options data available for ${symbol}`);
    }

    // Get spot price and historical volatility
    const ohlcData = await fetchOHLC(symbol, '1mo', '1d');
    const closes = ohlcData.map(d => d.close);
    const spotPrice = closes[closes.length - 1];
    const historicalVol = calculateHistoricalVolatility(closes);

    // Calculate time to expiry
    const expiryDate = new Date(optionsData.expirationDate * 1000);
    const now = new Date();
    const timeToExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24 * 365); // In years

    // Process calls
    const calls = (optionsData.calls || []).map(call => {
      const greeks = calculateAllGreeks(
        spotPrice,
        call.strike,
        timeToExpiry,
        config.riskFreeRate,
        call.impliedVolatility || historicalVol,
        'call'
      );

      return {
        strike: call.strike,
        lastPrice: call.lastPrice || 0,
        bid: call.bid || 0,
        ask: call.ask || 0,
        volume: call.volume || 0,
        openInterest: call.openInterest || 0,
        impliedVolatility: call.impliedVolatility || historicalVol,
        inTheMoney: call.inTheMoney || false,
        contractSymbol: call.contractSymbol,
        ...greeks,
      };
    });

    // Process puts
    const puts = (optionsData.puts || []).map(put => {
      const greeks = calculateAllGreeks(
        spotPrice,
        put.strike,
        timeToExpiry,
        config.riskFreeRate,
        put.impliedVolatility || historicalVol,
        'put'
      );

      return {
        strike: put.strike,
        lastPrice: put.lastPrice || 0,
        bid: put.bid || 0,
        ask: put.ask || 0,
        volume: put.volume || 0,
        openInterest: put.openInterest || 0,
        impliedVolatility: put.impliedVolatility || historicalVol,
        inTheMoney: put.inTheMoney || false,
        contractSymbol: put.contractSymbol,
        ...greeks,
      };
    });

    const result = {
      symbol: symbol,
      spotPrice: spotPrice,
      expiryDate: expiryDate.toISOString().split('T')[0],
      daysToExpiry: Math.round(timeToExpiry * 365),
      historicalVolatility: historicalVol,
      calls: calls,
      puts: puts,
      callsCount: calls.length,
      putsCount: puts.length,
      timestamp: new Date().toISOString(),
    };

    // Cache for 1 minute
    cache.set(cacheKey, result, config.cacheTTL.optionsChain);

    return result;
  } catch (error) {
    console.error(`Error fetching options chain for ${symbol}:`, error.message);
    throw new Error(`Failed to fetch options chain: ${error.message}`);
  }
}

/**
 * Calculate Greeks for a specific option
 * @param {Object} params - Parameters for Greeks calculation
 * @returns {Object} Greeks values
 */
export async function calculateGreeks(params) {
  try {
    const {
      spot,
      strike,
      expiry_date,
      volatility,
      option_type,
      risk_free_rate = config.riskFreeRate
    } = params;

    // Validate inputs
    if (!spot || !strike || !expiry_date || !volatility || !option_type) {
      throw new Error('Missing required parameters for Greeks calculation');
    }

    // Calculate time to expiry
    const expiryDate = new Date(expiry_date);
    const now = new Date();
    const timeToExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24 * 365);

    if (timeToExpiry < 0) {
      throw new Error('Expiry date is in the past');
    }

    // Calculate Greeks
    const greeks = calculateAllGreeks(
      spot,
      strike,
      timeToExpiry,
      risk_free_rate,
      volatility,
      option_type
    );

    return {
      spot: spot,
      strike: strike,
      expiryDate: expiry_date,
      daysToExpiry: Math.round(timeToExpiry * 365),
      volatility: volatility,
      optionType: option_type,
      riskFreeRate: risk_free_rate,
      greeks: greeks,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error calculating Greeks:', error.message);
    throw new Error(`Failed to calculate Greeks: ${error.message}`);
  }
}

/**
 * Calculate max pain point for options expiry
 * Max pain is the strike price where option writers (sellers) lose the least money
 * @param {Object} optionsChain - Options chain data
 * @returns {Object} Max pain analysis
 */
export function calculateMaxPain(optionsChain) {
  try {
    const { calls, puts, spotPrice } = optionsChain;

    if (!calls || !puts || calls.length === 0 || puts.length === 0) {
      throw new Error('Invalid options chain data');
    }

    // Get all unique strike prices
    const strikes = [...new Set([
      ...calls.map(c => c.strike),
      ...puts.map(p => p.strike)
    ])].sort((a, b) => a - b);

    // Calculate total pain for each strike
    const painByStrike = strikes.map(strike => {
      let totalPain = 0;

      // Calculate pain from call options
      calls.forEach(call => {
        if (strike > call.strike) {
          // Calls are ITM, writers lose money
          totalPain += (strike - call.strike) * call.openInterest;
        }
      });

      // Calculate pain from put options
      puts.forEach(put => {
        if (strike < put.strike) {
          // Puts are ITM, writers lose money
          totalPain += (put.strike - strike) * put.openInterest;
        }
      });

      return {
        strike: strike,
        totalPain: totalPain,
      };
    });

    // Find strike with minimum pain
    const maxPainPoint = painByStrike.reduce((min, current) => 
      current.totalPain < min.totalPain ? current : min
    );

    // Calculate Put-Call Ratio
    const totalCallOI = calls.reduce((sum, c) => sum + c.openInterest, 0);
    const totalPutOI = puts.reduce((sum, p) => sum + p.openInterest, 0);
    const putCallRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

    // Find strikes with highest OI
    const topCallOI = [...calls].sort((a, b) => b.openInterest - a.openInterest).slice(0, 5);
    const topPutOI = [...puts].sort((a, b) => b.openInterest - a.openInterest).slice(0, 5);

    return {
      symbol: optionsChain.symbol,
      spotPrice: spotPrice,
      maxPainStrike: maxPainPoint.strike,
      maxPainValue: maxPainPoint.totalPain,
      distanceFromSpot: ((maxPainPoint.strike - spotPrice) / spotPrice * 100).toFixed(2),
      putCallRatio: putCallRatio.toFixed(2),
      totalCallOI: totalCallOI,
      totalPutOI: totalPutOI,
      interpretation: maxPainPoint.strike > spotPrice 
        ? 'Price may move up towards max pain'
        : maxPainPoint.strike < spotPrice
        ? 'Price may move down towards max pain'
        : 'Price is at max pain point',
      topCallStrikes: topCallOI.map(c => ({ strike: c.strike, oi: c.openInterest })),
      topPutStrikes: topPutOI.map(p => ({ strike: p.strike, oi: p.openInterest })),
      expiryDate: optionsChain.expiryDate,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error calculating max pain:', error.message);
    throw new Error(`Failed to calculate max pain: ${error.message}`);
  }
}

/**
 * Detect unusual options activity
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Unusual activity analysis
 */
export async function detectUnusualActivity(symbol) {
  try {
    // Fetch current options chain
    const optionsChain = await fetchOptionsChain(symbol);
    
    // Calculate average volume and OI from the chain
    const allOptions = [...optionsChain.calls, ...optionsChain.puts];
    
    if (allOptions.length === 0) {
      throw new Error('No options data available');
    }

    // Calculate statistics
    const avgVolume = allOptions.reduce((sum, opt) => sum + opt.volume, 0) / allOptions.length;
    const avgOI = allOptions.reduce((sum, opt) => sum + opt.openInterest, 0) / allOptions.length;

    // Find unusual activity (volume > 3x average or OI change significant)
    const unusualCalls = optionsChain.calls.filter(call => {
      const volumeRatio = avgVolume > 0 ? call.volume / avgVolume : 0;
      const volumeOIRatio = call.openInterest > 0 ? call.volume / call.openInterest : 0;
      
      return volumeRatio > 3 || volumeOIRatio > 0.5; // High volume relative to OI
    }).sort((a, b) => b.volume - a.volume).slice(0, 10);

    const unusualPuts = optionsChain.puts.filter(put => {
      const volumeRatio = avgVolume > 0 ? put.volume / avgVolume : 0;
      const volumeOIRatio = put.openInterest > 0 ? put.volume / put.openInterest : 0;
      
      return volumeRatio > 3 || volumeOIRatio > 0.5;
    }).sort((a, b) => b.volume - a.volume).slice(0, 10);

    // Calculate volume-weighted average strike
    const callVolumeStrike = optionsChain.calls.reduce((sum, c) => sum + c.strike * c.volume, 0) / 
                              optionsChain.calls.reduce((sum, c) => sum + c.volume, 0);
    const putVolumeStrike = optionsChain.puts.reduce((sum, p) => sum + p.strike * p.volume, 0) / 
                             optionsChain.puts.reduce((sum, p) => sum + p.volume, 0);

    // Total volumes
    const totalCallVolume = optionsChain.calls.reduce((sum, c) => sum + c.volume, 0);
    const totalPutVolume = optionsChain.puts.reduce((sum, p) => sum + p.volume, 0);
    const volumeRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;

    return {
      symbol: symbol,
      spotPrice: optionsChain.spotPrice,
      expiryDate: optionsChain.expiryDate,
      summary: {
        totalCallVolume: totalCallVolume,
        totalPutVolume: totalPutVolume,
        putCallVolumeRatio: volumeRatio.toFixed(2),
        averageVolume: Math.round(avgVolume),
        averageOI: Math.round(avgOI),
      },
      interpretation: volumeRatio > 1.5 
        ? 'Bearish: High put volume suggests hedging or bearish bets'
        : volumeRatio < 0.67
        ? 'Bullish: High call volume suggests bullish positioning'
        : 'Neutral: Balanced call and put activity',
      unusualCalls: unusualCalls.map(c => ({
        strike: c.strike,
        volume: c.volume,
        openInterest: c.openInterest,
        volumeToOI: (c.volume / Math.max(c.openInterest, 1)).toFixed(2),
        impliedVolatility: c.impliedVolatility.toFixed(4),
        delta: c.delta.toFixed(4),
      })),
      unusualPuts: unusualPuts.map(p => ({
        strike: p.strike,
        volume: p.volume,
        openInterest: p.openInterest,
        volumeToOI: (p.volume / Math.max(p.openInterest, 1)).toFixed(2),
        impliedVolatility: p.impliedVolatility.toFixed(4),
        delta: p.delta.toFixed(4),
      })),
      volumeWeightedStrikes: {
        calls: callVolumeStrike.toFixed(2),
        puts: putVolumeStrike.toFixed(2),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error detecting unusual activity for ${symbol}:`, error.message);
    throw new Error(`Failed to detect unusual activity: ${error.message}`);
  }
}
