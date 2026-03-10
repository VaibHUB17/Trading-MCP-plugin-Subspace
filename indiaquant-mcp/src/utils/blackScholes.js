/**
 * Black-Scholes Option Pricing Model - Pure JavaScript Implementation
 * Implements full Greeks calculation from scratch without external libraries
 */

/**
 * Standard Normal Probability Density Function
 * φ(x) = (1/√(2π)) * e^(-x²/2)
 */
export function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard Normal Cumulative Distribution Function
 * Using Abramowitz & Stegun approximation (1964) - error < 7.5e-8
 */
export function normalCDF(x) {
  // Constants for approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Save the sign of x
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x) / Math.sqrt(2);

  // Abramowitz & Stegun formula
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Black-Scholes Option Pricing Formula
 * @param {number} S - Current stock price (spot price)
 * @param {number} K - Strike price
 * @param {number} T - Time to expiration in years
 * @param {number} r - Risk-free interest rate (annual)
 * @param {number} sigma - Volatility (annual)
 * @param {string} type - 'call' or 'put'
 * @returns {number} Option price
 */
export function blackScholes(S, K, T, r, sigma, type) {
  if (T <= 0) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
  if (sigma <= 0 || S <= 0 || K <= 0) return 0;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (type === 'call' || type === 'CE') {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
}

/**
 * Calculate Delta (∂V/∂S)
 * Measures rate of change of option value with respect to changes in underlying price
 * Call: N(d1), Put: N(d1) - 1
 */
export function calculateDelta(S, K, T, r, sigma, type) {
  if (T <= 0) {
    if (type === 'call' || type === 'CE') return S > K ? 1 : 0;
    return S < K ? -1 : 0;
  }
  if (sigma <= 0 || S <= 0 || K <= 0) return 0;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));

  if (type === 'call' || type === 'CE') {
    return normalCDF(d1);
  } else {
    return normalCDF(d1) - 1;
  }
}

/**
 * Calculate Gamma (∂²V/∂S²)
 * Measures rate of change of delta with respect to changes in underlying price
 * Same for both calls and puts: N'(d1) / (S * σ * √T)
 */
export function calculateGamma(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

/**
 * Calculate Vega (∂V/∂σ)
 * Measures sensitivity to volatility (per 1% change in volatility)
 * Same for both calls and puts: S * N'(d1) * √T / 100
 */
export function calculateVega(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * normalPDF(d1) * Math.sqrt(T) / 100;
}

/**
 * Calculate Theta (∂V/∂T)
 * Measures time decay (per day)
 * Different formulas for calls and puts
 */
export function calculateTheta(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  // Common term for both call and put
  const term1 = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));

  if (type === 'call' || type === 'CE') {
    const term2 = r * K * Math.exp(-r * T) * normalCDF(d2);
    // Divide by 365 to get theta per day
    return (term1 - term2) / 365;
  } else {
    const term2 = r * K * Math.exp(-r * T) * normalCDF(-d2);
    // Divide by 365 to get theta per day
    return (term1 + term2) / 365;
  }
}

/**
 * Calculate Rho (∂V/∂r)
 * Measures sensitivity to interest rate changes (per 1% change)
 */
export function calculateRho(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (type === 'call' || type === 'CE') {
    return K * T * Math.exp(-r * T) * normalCDF(d2) / 100;
  } else {
    return -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100;
  }
}

/**
 * Calculate all Greeks at once
 * @returns {object} { delta, gamma, theta, vega, rho }
 */
export function calculateAllGreeks(S, K, T, r, sigma, type) {
  return {
    delta: calculateDelta(S, K, T, r, sigma, type),
    gamma: calculateGamma(S, K, T, r, sigma),
    theta: calculateTheta(S, K, T, r, sigma, type),
    vega: calculateVega(S, K, T, r, sigma),
    rho: calculateRho(S, K, T, r, sigma, type),
  };
}

/**
 * Calculate implied volatility using Newton-Raphson method
 * @param {number} marketPrice - Observed option price
 * @param {number} S - Spot price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry
 * @param {number} r - Risk-free rate
 * @param {string} type - 'call' or 'put'
 * @returns {number} Implied volatility
 */
export function calculateImpliedVolatility(marketPrice, S, K, T, r, type) {
  if (T <= 0) return 0;

  let sigma = 0.3; // Initial guess: 30% volatility
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    const price = blackScholes(S, K, T, r, sigma, type);
    const vega = calculateVega(S, K, T, r, sigma);

    if (Math.abs(vega) < 1e-10) break;

    const diff = marketPrice - price;
    if (Math.abs(diff) < tolerance) return sigma;

    sigma = sigma + diff / (vega * 100); // Adjust by vega (already divided by 100)
    
    // Keep sigma in reasonable bounds
    if (sigma < 0.01) sigma = 0.01;
    if (sigma > 5) sigma = 5;
  }

  return sigma;
}
