/**
 * Technical Indicators Calculator
 * Implements common technical analysis indicators for stock price analysis
 */

interface PriceData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorResult {
  date: Date;
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema12?: number;
  ema26?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
  stochasticK?: number;
  stochasticD?: number;
  atr14?: number;
  adx14?: number;
}

export class TechnicalIndicators {
  /**
   * Calculate Simple Moving Average (SMA)
   */
  static calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        sma.push(NaN);
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }

    return sma;
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   */
  static calculateEMA(prices: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);

    // First EMA is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      if (i < prices.length) {
        sum += prices[i];
      }
    }
    const firstEMA = sum / period;

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        ema.push(NaN);
      } else if (i === period - 1) {
        ema.push(firstEMA);
      } else {
        const value = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
        ema.push(value);
      }
    }

    return ema;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   */
  static calculateRSI(prices: number[], period: number = 14): number[] {
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];

    let avgGain = 0;
    let avgLoss = 0;

    // Calculate price changes
    for (let i = 0; i < prices.length; i++) {
      if (i === 0) {
        gains.push(0);
        losses.push(0);
        rsi.push(NaN);
      } else {
        const change = prices[i] - prices[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);

        if (i < period) {
          rsi.push(NaN);
        } else if (i === period) {
          // Initial average: simple mean of first period gains/losses
          avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
          avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;

          // Calculate RSI
          if (avgLoss === 0) {
            // All gains, no losses
            rsi.push(avgGain === 0 ? 50 : 100);
          } else {
            const rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
          }
        } else {
          // Smoothed averages using Wilder's smoothing method
          avgGain = (avgGain * (period - 1) + gains[i]) / period;
          avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

          // Calculate RSI
          if (avgLoss === 0) {
            // All gains, no losses
            rsi.push(avgGain === 0 ? 50 : 100);
          } else {
            const rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
          }
        }
      }
    }

    return rsi;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  static calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
    macd: number[];
    signal: number[];
    histogram: number[];
  } {
    const ema12 = this.calculateEMA(prices, fastPeriod);
    const ema26 = this.calculateEMA(prices, slowPeriod);

    const macd: number[] = [];
    for (let i = 0; i < prices.length; i++) {
      if (isNaN(ema12[i]) || isNaN(ema26[i])) {
        macd.push(NaN);
      } else {
        macd.push(ema12[i] - ema26[i]);
      }
    }

    const signal = this.calculateEMA(macd.filter(v => !isNaN(v)), signalPeriod);

    // Pad signal array to match length
    const paddedSignal: number[] = new Array(macd.length - signal.length).fill(NaN).concat(signal);

    const histogram: number[] = macd.map((m, i) =>
      isNaN(m) || isNaN(paddedSignal[i]) ? NaN : m - paddedSignal[i]
    );

    return { macd, signal: paddedSignal, histogram };
  }

  /**
   * Calculate Bollinger Bands
   */
  static calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
    upper: number[];
    middle: number[];
    lower: number[];
  } {
    const middle = this.calculateSMA(prices, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        upper.push(NaN);
        lower.push(NaN);
      } else {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = middle[i];
        const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
        const sd = Math.sqrt(variance);

        upper.push(mean + (stdDev * sd));
        lower.push(mean - (stdDev * sd));
      }
    }

    return { upper, middle, lower };
  }

  /**
   * Calculate Stochastic Oscillator
   */
  static calculateStochastic(highs: number[], lows: number[], closes: number[], period: number = 14, smoothK: number = 3): {
    k: number[];
    d: number[];
  } {
    const k: number[] = [];

    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) {
        k.push(NaN);
      } else {
        const highsSlice = highs.slice(i - period + 1, i + 1);
        const lowsSlice = lows.slice(i - period + 1, i + 1);
        const highestHigh = Math.max(...highsSlice);
        const lowestLow = Math.min(...lowsSlice);
        const currentClose = closes[i];

        const stochValue = lowestLow === highestHigh
          ? 50
          : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

        k.push(stochValue);
      }
    }

    // Smooth %K
    const smoothedK = this.calculateSMA(k.filter(v => !isNaN(v)), smoothK);
    const paddedK: number[] = new Array(k.length - smoothedK.length).fill(NaN).concat(smoothedK);

    // %D is SMA of %K
    const d = this.calculateSMA(paddedK.filter(v => !isNaN(v)), 3);
    const paddedD: number[] = new Array(paddedK.length - d.length).fill(NaN).concat(d);

    return { k: paddedK, d: paddedD };
  }

  /**
   * Calculate Average True Range (ATR)
   */
  static calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    const trueRanges: number[] = [];

    for (let i = 0; i < closes.length; i++) {
      if (i === 0) {
        trueRanges.push(highs[i] - lows[i]);
      } else {
        const tr1 = highs[i] - lows[i];
        const tr2 = Math.abs(highs[i] - closes[i - 1]);
        const tr3 = Math.abs(lows[i] - closes[i - 1]);
        trueRanges.push(Math.max(tr1, tr2, tr3));
      }
    }

    return this.calculateEMA(trueRanges, period);
  }

  /**
   * Calculate Average Directional Index (ADX)
   */
  static calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    const adx: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const tr: number[] = [];

    // Calculate directional movement and true range
    for (let i = 0; i < closes.length; i++) {
      if (i === 0) {
        plusDM.push(0);
        minusDM.push(0);
        tr.push(highs[i] - lows[i]);
        adx.push(NaN);
      } else {
        const highDiff = highs[i] - highs[i - 1];
        const lowDiff = lows[i - 1] - lows[i];

        plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
        minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

        const tr1 = highs[i] - lows[i];
        const tr2 = Math.abs(highs[i] - closes[i - 1]);
        const tr3 = Math.abs(lows[i] - closes[i - 1]);
        tr.push(Math.max(tr1, tr2, tr3));

        if (i < period * 2) {
          adx.push(NaN);
        } else {
          // Simplified ADX calculation
          const avgPlusDM = plusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
          const avgMinusDM = minusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
          const avgTR = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;

          const plusDI = avgTR === 0 ? 0 : (avgPlusDM / avgTR) * 100;
          const minusDI = avgTR === 0 ? 0 : (avgMinusDM / avgTR) * 100;

          const dx = plusDI + minusDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
          adx.push(dx);
        }
      }
    }

    return adx;
  }

  /**
   * Calculate all indicators for a price series
   */
  static calculateAllIndicators(priceData: PriceData[]): IndicatorResult[] {
    const closes = priceData.map(p => p.close);
    const highs = priceData.map(p => p.high);
    const lows = priceData.map(p => p.low);

    const rsi14 = this.calculateRSI(closes, 14);
    const macdData = this.calculateMACD(closes);
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = this.calculateSMA(closes, 200);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    const stochastic = this.calculateStochastic(highs, lows, closes, 14, 3);
    const atr14 = this.calculateATR(highs, lows, closes, 14);
    const adx14 = this.calculateADX(highs, lows, closes, 14);

    const results: IndicatorResult[] = priceData.map((data, i) => ({
      date: data.date,
      rsi14: isNaN(rsi14[i]) ? undefined : rsi14[i],
      macd: isNaN(macdData.macd[i]) ? undefined : macdData.macd[i],
      macdSignal: isNaN(macdData.signal[i]) ? undefined : macdData.signal[i],
      macdHistogram: isNaN(macdData.histogram[i]) ? undefined : macdData.histogram[i],
      sma20: isNaN(sma20[i]) ? undefined : sma20[i],
      sma50: isNaN(sma50[i]) ? undefined : sma50[i],
      sma200: isNaN(sma200[i]) ? undefined : sma200[i],
      ema12: isNaN(ema12[i]) ? undefined : ema12[i],
      ema26: isNaN(ema26[i]) ? undefined : ema26[i],
      bollingerUpper: isNaN(bollinger.upper[i]) ? undefined : bollinger.upper[i],
      bollingerMiddle: isNaN(bollinger.middle[i]) ? undefined : bollinger.middle[i],
      bollingerLower: isNaN(bollinger.lower[i]) ? undefined : bollinger.lower[i],
      stochasticK: isNaN(stochastic.k[i]) ? undefined : stochastic.k[i],
      stochasticD: isNaN(stochastic.d[i]) ? undefined : stochastic.d[i],
      atr14: isNaN(atr14[i]) ? undefined : atr14[i],
      adx14: isNaN(adx14[i]) ? undefined : adx14[i],
    }));

    return results;
  }
}

export default TechnicalIndicators;
