/**
 * Signal Generator Module
 * Technical analysis, pattern detection, sentiment analysis, and signal fusion
 */

import { RSI, MACD, BollingerBands, EMA } from 'technicalindicators';
import axios from 'axios';
import { fetchOHLC, fetchLivePrice } from './marketData.js';
import { config, sentimentKeywords } from '../config.js';
import cache from '../utils/cache.js';

/**
 * Compute RSI (Relative Strength Index)
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number[]} RSI values
 */
export function computeRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) {
    throw new Error(`Need at least ${period + 1} data points for RSI calculation`);
  }

  const rsiInput = {
    values: closes,
    period: period,
  };

  return RSI.calculate(rsiInput);
}

/**
 * Compute MACD (Moving Average Convergence Divergence)
 * @param {number[]} closes - Array of closing prices
 * @returns {Object[]} Array of { MACD, signal, histogram }
 */
export function computeMACD(closes) {
  if (!closes || closes.length < 26) {
    throw new Error('Need at least 26 data points for MACD calculation');
  }

  const macdInput = {
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  };

  return MACD.calculate(macdInput);
}

/**
 * Compute Bollinger Bands
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - Period (default 20)
 * @param {number} stdDev - Standard deviations (default 2)
 * @returns {Object[]} Array of { upper, middle, lower, pb }
 */
export function computeBollingerBands(closes, period = 20, stdDev = 2) {
  if (!closes || closes.length < period) {
    throw new Error(`Need at least ${period} data points for Bollinger Bands`);
  }

  const bbInput = {
    period: period,
    values: closes,
    stdDev: stdDev,
  };

  const bbResult = BollingerBands.calculate(bbInput);
  
  // Calculate %B (position within bands)
  return bbResult.map((band, idx) => {
    const close = closes[closes.length - bbResult.length + idx];
    const pb = band.upper !== band.lower 
      ? (close - band.lower) / (band.upper - band.lower) 
      : 0.5;
    
    return {
      upper: band.upper,
      middle: band.middle,
      lower: band.lower,
      pb: pb, // %B indicator
    };
  });
}

/**
 * Detect chart patterns
 * @param {Array} ohlcData - OHLC data
 * @returns {Object} Detected patterns
 */
export function detectPatterns(ohlcData) {
  if (!ohlcData || ohlcData.length < 20) {
    return { patterns: [], confidence: 0 };
  }

  const patterns = [];
  const closes = ohlcData.map(d => d.close);
  const highs = ohlcData.map(d => d.high);
  const lows = ohlcData.map(d => d.low);

  // Find local peaks and troughs
  const peaks = findPeaks(highs);
  const troughs = findTroughs(lows);

  // Double Top Detection
  if (peaks.length >= 2) {
    const lastTwoPeaks = peaks.slice(-2);
    const [peak1, peak2] = lastTwoPeaks;
    const priceDiff = Math.abs(highs[peak1] - highs[peak2]) / highs[peak1];
    
    if (priceDiff < 0.03 && peak2 > peak1) { // Within 3% and second peak is recent
      patterns.push({
        name: 'Double Top',
        type: 'bearish',
        confidence: 70,
        description: 'Two peaks at similar price levels suggesting reversal'
      });
    }
  }

  // Double Bottom Detection
  if (troughs.length >= 2) {
    const lastTwoTroughs = troughs.slice(-2);
    const [trough1, trough2] = lastTwoTroughs;
    const priceDiff = Math.abs(lows[trough1] - lows[trough2]) / lows[trough1];
    
    if (priceDiff < 0.03 && trough2 > trough1) {
      patterns.push({
        name: 'Double Bottom',
        type: 'bullish',
        confidence: 70,
        description: 'Two troughs at similar price levels suggesting reversal'
      });
    }
  }

  // Head and Shoulders Detection (simplified)
  if (peaks.length >= 3) {
    const lastThreePeaks = peaks.slice(-3);
    const [left, head, right] = lastThreePeaks.map(i => highs[i]);
    
    if (head > left && head > right && Math.abs(left - right) / left < 0.05) {
      patterns.push({
        name: 'Head and Shoulders',
        type: 'bearish',
        confidence: 75,
        description: 'Classic reversal pattern with head higher than shoulders'
      });
    }
  }

  // Inverse Head and Shoulders
  if (troughs.length >= 3) {
    const lastThreeTroughs = troughs.slice(-3);
    const [left, head, right] = lastThreeTroughs.map(i => lows[i]);
    
    if (head < left && head < right && Math.abs(left - right) / left < 0.05) {
      patterns.push({
        name: 'Inverse Head and Shoulders',
        type: 'bullish',
        confidence: 75,
        description: 'Classic bullish reversal pattern'
      });
    }
  }

  // Recent trend detection
  const recentCloses = closes.slice(-10);
  const trend = recentCloses[recentCloses.length - 1] > recentCloses[0] ? 'bullish' : 'bearish';
  const trendStrength = Math.abs(recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0] * 100;

  return {
    patterns: patterns,
    trend: trend,
    trendStrength: trendStrength,
    confidence: patterns.length > 0 ? Math.max(...patterns.map(p => p.confidence)) : 0
  };
}

/**
 * Find peaks in price data
 */
function findPeaks(data, window = 5) {
  const peaks = [];
  for (let i = window; i < data.length - window; i++) {
    let isPeak = true;
    for (let j = 1; j <= window; j++) {
      if (data[i] <= data[i - j] || data[i] <= data[i + j]) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) peaks.push(i);
  }
  return peaks;
}

/**
 * Find troughs in price data
 */
function findTroughs(data, window = 5) {
  const troughs = [];
  for (let i = window; i < data.length - window; i++) {
    let isTrough = true;
    for (let j = 1; j <= window; j++) {
      if (data[i] >= data[i - j] || data[i] >= data[i + j]) {
        isTrough = false;
        break;
      }
    }
    if (isTrough) troughs.push(i);
  }
  return troughs;
}

/**
 * Fetch news sentiment using NewsAPI
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Sentiment analysis result
 */
export async function fetchNewsSentiment(symbol) {
  try {
    const cacheKey = `sentiment:${symbol}`;
    
    // Check cache first (30 min TTL)
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!config.newsApiKey) {
      return {
        score: 0,
        sentiment: 'neutral',
        articles: [],
        note: 'NewsAPI key not configured'
      };
    }

    // Fetch news articles
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: symbol,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 10,
        apiKey: config.newsApiKey,
      },
      timeout: 5000,
    });

    if (!response.data || !response.data.articles) {
      throw new Error('No news data received');
    }

    const articles = response.data.articles.slice(0, 10);
    
    // Analyze sentiment
    let totalScore = 0;
    const scoredArticles = articles.map(article => {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();
      let score = 0;

      // Count bullish keywords
      sentimentKeywords.bullish.forEach(keyword => {
        if (text.includes(keyword)) score += 1;
      });

      // Count bearish keywords
      sentimentKeywords.bearish.forEach(keyword => {
        if (text.includes(keyword)) score -= 1;
      });

      totalScore += score;

      return {
        title: article.title,
        description: article.description,
        url: article.url,
        publishedAt: article.publishedAt,
        source: article.source.name,
        score: score,
        sentiment: score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral'
      };
    });

    // Normalize score to -1 to 1 range
    const avgScore = articles.length > 0 ? totalScore / articles.length : 0;
    const normalizedScore = Math.max(-1, Math.min(1, avgScore / 3));

    const result = {
      symbol: symbol,
      score: normalizedScore,
      sentiment: normalizedScore > 0.2 ? 'bullish' : normalizedScore < -0.2 ? 'bearish' : 'neutral',
      articlesAnalyzed: articles.length,
      topArticles: scoredArticles.slice(0, 3),
      timestamp: new Date().toISOString(),
    };

    // Cache the result
    cache.set(cacheKey, result, config.cacheTTL.newsSentiment);

    return result;
  } catch (error) {
    console.error(`Error fetching news sentiment for ${symbol}:`, error.message);
    
    // Return neutral sentiment on error
    return {
      symbol: symbol,
      score: 0,
      sentiment: 'neutral',
      articlesAnalyzed: 0,
      topArticles: [],
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generate trading signal by fusing multiple indicators
 * @param {string} symbol - Stock symbol
 * @param {string} timeframe - Time period (1mo, 3mo, 6mo, 1y)
 * @returns {Promise<Object>} Trading signal with confidence
 */
export async function generateSignal(symbol, timeframe = '3mo') {
  try {
    // Fetch price and OHLC data
    const [priceData, ohlcData, sentiment] = await Promise.all([
      fetchLivePrice(symbol),
      fetchOHLC(symbol, timeframe, '1d'),
      fetchNewsSentiment(symbol)
    ]);

    const closes = ohlcData.map(d => d.close);
    const highs = ohlcData.map(d => d.high);
    const lows = ohlcData.map(d => d.low);

    // Calculate indicators
    const rsi = computeRSI(closes);
    const macd = computeMACD(closes);
    const bollinger = computeBollingerBands(closes);
    const patterns = detectPatterns(ohlcData);

    // Get latest values
    const currentRSI = rsi[rsi.length - 1];
    const currentMACD = macd[macd.length - 1];
    const currentBB = bollinger[bollinger.length - 1];
    const currentPrice = priceData.price;

    // Scoring system (0-100 for each indicator)
    let scores = {
      rsi: 50,
      macd: 50,
      bollinger: 50,
      pattern: 50,
      sentiment: 50,
    };

    let reasoning = [];

    // RSI Analysis (Weight: 25%)
    if (currentRSI < 30) {
      scores.rsi = 75;
      reasoning.push(`RSI at ${currentRSI.toFixed(2)} indicates oversold conditions`);
    } else if (currentRSI > 70) {
      scores.rsi = 25;
      reasoning.push(`RSI at ${currentRSI.toFixed(2)} indicates overbought conditions`);
    } else {
      scores.rsi = 50 + (50 - currentRSI) / 2;
      reasoning.push(`RSI at ${currentRSI.toFixed(2)} is neutral`);
    }

    // MACD Analysis (Weight: 25%)
    if (currentMACD.MACD > currentMACD.signal && currentMACD.histogram > 0) {
      scores.macd = 75;
      reasoning.push('MACD shows bullish momentum with positive histogram');
    } else if (currentMACD.MACD < currentMACD.signal && currentMACD.histogram < 0) {
      scores.macd = 25;
      reasoning.push('MACD shows bearish momentum with negative histogram');
    } else {
      scores.macd = 50;
      reasoning.push('MACD signals are neutral');
    }

    // Bollinger Bands Analysis (Weight: 20%)
    if (currentBB.pb < 0.2) {
      scores.bollinger = 75;
      reasoning.push('Price near lower Bollinger Band, potential bounce');
    } else if (currentBB.pb > 0.8) {
      scores.bollinger = 25;
      reasoning.push('Price near upper Bollinger Band, potential pullback');
    } else {
      scores.bollinger = 50;
      reasoning.push('Price within normal Bollinger Band range');
    }

    // Pattern Analysis (Weight: 15%)
    if (patterns.patterns.length > 0) {
      const bullishPatterns = patterns.patterns.filter(p => p.type === 'bullish');
      const bearishPatterns = patterns.patterns.filter(p => p.type === 'bearish');
      
      if (bullishPatterns.length > bearishPatterns.length) {
        scores.pattern = 70;
        reasoning.push(`Detected ${bullishPatterns.map(p => p.name).join(', ')}`);
      } else if (bearishPatterns.length > bullishPatterns.length) {
        scores.pattern = 30;
        reasoning.push(`Detected ${bearishPatterns.map(p => p.name).join(', ')}`);
      } else {
        scores.pattern = 50;
      }
    } else {
      scores.pattern = 50;
      reasoning.push('No significant chart patterns detected');
    }

    // Sentiment Analysis (Weight: 15%)
    if (sentiment.score > 0.2) {
      scores.sentiment = 70;
      reasoning.push(`News sentiment is ${sentiment.sentiment} (${sentiment.score.toFixed(2)})`);
    } else if (sentiment.score < -0.2) {
      scores.sentiment = 30;
      reasoning.push(`News sentiment is ${sentiment.sentiment} (${sentiment.score.toFixed(2)})`);
    } else {
      scores.sentiment = 50;
      reasoning.push('News sentiment is neutral');
    }

    // Calculate weighted final score
    const weights = {
      rsi: 0.25,
      macd: 0.25,
      bollinger: 0.20,
      pattern: 0.15,
      sentiment: 0.15,
    };

    const finalScore = 
      scores.rsi * weights.rsi +
      scores.macd * weights.macd +
      scores.bollinger * weights.bollinger +
      scores.pattern * weights.pattern +
      scores.sentiment * weights.sentiment;

    // Determine signal
    let signal, confidence;
    if (finalScore >= 60) {
      signal = 'BUY';
      confidence = finalScore;
    } else if (finalScore <= 40) {
      signal = 'SELL';
      confidence = 100 - finalScore;
    } else {
      signal = 'HOLD';
      confidence = 50;
    }

    return {
      symbol: symbol,
      signal: signal,
      confidence: Math.round(confidence),
      currentPrice: currentPrice,
      indicators: {
        rsi: {
          value: currentRSI,
          signal: scores.rsi > 60 ? 'bullish' : scores.rsi < 40 ? 'bearish' : 'neutral',
        },
        macd: {
          value: currentMACD.MACD,
          signal: currentMACD.signal,
          histogram: currentMACD.histogram,
          trend: scores.macd > 60 ? 'bullish' : scores.macd < 40 ? 'bearish' : 'neutral',
        },
        bollinger: {
          upper: currentBB.upper,
          middle: currentBB.middle,
          lower: currentBB.lower,
          percentB: currentBB.pb,
          position: scores.bollinger > 60 ? 'near lower' : scores.bollinger < 40 ? 'near upper' : 'middle',
        },
        patterns: patterns.patterns,
        sentiment: {
          score: sentiment.score,
          sentiment: sentiment.sentiment,
          articlesAnalyzed: sentiment.articlesAnalyzed,
        },
      },
      reasoning: reasoning,
      timeframe: timeframe,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error generating signal for ${symbol}:`, error.message);
    throw new Error(`Failed to generate signal: ${error.message}`);
  }
}
