/**
 * Orderbook Reconstructor for tick-level delta data.
 *
 * Efficiently reconstructs full orderbook state from checkpoint + deltas.
 * All reconstruction happens client-side for optimal server performance.
 *
 * @example
 * ```typescript
 * // Get raw tick data
 * const tickData = await client.lighter.orderbook.historyTick('BTC', { start, end });
 *
 * // Reconstruct to get snapshots at each delta
 * const reconstructor = new OrderBookReconstructor();
 * const snapshots = reconstructor.reconstructAll(tickData.checkpoint, tickData.deltas);
 *
 * // Or iterate efficiently (memory-friendly for large datasets)
 * for (const snapshot of reconstructor.iterate(tickData.checkpoint, tickData.deltas)) {
 *   console.log(snapshot.timestamp, snapshot.bids[0], snapshot.asks[0]);
 * }
 * ```
 */

import type { OrderBook, PriceLevel, OrderbookDelta } from './types';

/**
 * Price level stored internally with numeric values for efficient computation
 */
interface InternalLevel {
  price: number;
  size: number;
  orders: number;
}

/**
 * Reconstructed orderbook snapshot with timestamp
 */
export interface ReconstructedOrderBook extends OrderBook {
  /** Sequence number of the last applied delta */
  sequence?: number;
}

/**
 * Raw tick data from the API (checkpoint + deltas)
 */
export interface TickData {
  /** Initial orderbook state */
  checkpoint: OrderBook;
  /** Incremental changes to apply */
  deltas: OrderbookDelta[];
}

/**
 * Options for reconstruction
 */
export interface ReconstructOptions {
  /** Maximum depth (price levels) to include in output. Default: all levels */
  depth?: number;
  /** If true, yield a snapshot after every delta. If false, only return final state. Default: true */
  emitAll?: boolean;
}

/**
 * Orderbook Reconstructor
 *
 * Maintains orderbook state and efficiently applies delta updates.
 * Uses sorted arrays with binary search for O(log n) insertions.
 *
 * Thread-safe for single-threaded JavaScript; for worker threads,
 * create a separate instance per thread.
 */
export class OrderBookReconstructor {
  private bids: Map<number, InternalLevel> = new Map();
  private asks: Map<number, InternalLevel> = new Map();
  private coin: string = '';
  private lastTimestamp: string = '';
  private lastSequence: number = 0;

  /**
   * Initialize or reset the reconstructor with a checkpoint
   */
  initialize(checkpoint: OrderBook): void {
    this.bids.clear();
    this.asks.clear();
    this.coin = checkpoint.coin;
    this.lastTimestamp = checkpoint.timestamp;
    this.lastSequence = 0;

    // Parse checkpoint bids
    for (const level of checkpoint.bids) {
      const price = parseFloat(level.px);
      this.bids.set(price, {
        price,
        size: parseFloat(level.sz),
        orders: level.n,
      });
    }

    // Parse checkpoint asks
    for (const level of checkpoint.asks) {
      const price = parseFloat(level.px);
      this.asks.set(price, {
        price,
        size: parseFloat(level.sz),
        orders: level.n,
      });
    }
  }

  /**
   * Apply a single delta to the current state
   */
  applyDelta(delta: OrderbookDelta): void {
    const book = delta.side === 'bid' ? this.bids : this.asks;

    if (delta.size === 0) {
      // Remove level
      book.delete(delta.price);
    } else {
      // Insert or update level
      book.set(delta.price, {
        price: delta.price,
        size: delta.size,
        orders: 1, // Deltas don't include order count, assume 1
      });
    }

    this.lastTimestamp = new Date(delta.timestamp).toISOString();
    this.lastSequence = delta.sequence;
  }

  /**
   * Get the current orderbook state as a snapshot
   */
  getSnapshot(depth?: number): ReconstructedOrderBook {
    // Sort bids descending (best bid first)
    const sortedBids = Array.from(this.bids.values())
      .sort((a, b) => b.price - a.price);

    // Sort asks ascending (best ask first)
    const sortedAsks = Array.from(this.asks.values())
      .sort((a, b) => a.price - b.price);

    // Apply depth limit
    const bidsOutput = (depth ? sortedBids.slice(0, depth) : sortedBids)
      .map(this.toLevel);
    const asksOutput = (depth ? sortedAsks.slice(0, depth) : sortedAsks)
      .map(this.toLevel);

    // Calculate mid price and spread
    const bestBid = sortedBids[0]?.price;
    const bestAsk = sortedAsks[0]?.price;
    const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
    const spread = bestBid && bestAsk ? bestAsk - bestBid : undefined;
    const spreadBps = midPrice && spread ? (spread / midPrice) * 10000 : undefined;

    return {
      coin: this.coin,
      timestamp: this.lastTimestamp,
      bids: bidsOutput,
      asks: asksOutput,
      midPrice: midPrice?.toString(),
      spread: spread?.toString(),
      spreadBps: spreadBps?.toFixed(2),
      sequence: this.lastSequence,
    };
  }

  /**
   * Convert internal level to API format
   */
  private toLevel = (level: InternalLevel): PriceLevel => ({
    px: level.price.toString(),
    sz: level.size.toString(),
    n: level.orders,
  });

  /**
   * Reconstruct all orderbook states from checkpoint + deltas.
   * Returns an array of snapshots, one after each delta.
   *
   * For large datasets, prefer `iterate()` to avoid memory issues.
   *
   * @param checkpoint - Initial orderbook state
   * @param deltas - Array of delta updates
   * @param options - Reconstruction options
   * @returns Array of reconstructed orderbook snapshots
   */
  reconstructAll(
    checkpoint: OrderBook,
    deltas: OrderbookDelta[],
    options: ReconstructOptions = {}
  ): ReconstructedOrderBook[] {
    const { depth, emitAll = true } = options;
    const snapshots: ReconstructedOrderBook[] = [];

    this.initialize(checkpoint);

    // Sort deltas by sequence to ensure correct order
    const sortedDeltas = [...deltas].sort((a, b) => a.sequence - b.sequence);

    if (emitAll) {
      // Emit initial state
      snapshots.push(this.getSnapshot(depth));
    }

    for (const delta of sortedDeltas) {
      this.applyDelta(delta);
      if (emitAll) {
        snapshots.push(this.getSnapshot(depth));
      }
    }

    if (!emitAll) {
      // Only return final state
      snapshots.push(this.getSnapshot(depth));
    }

    return snapshots;
  }

  /**
   * Iterate over reconstructed orderbook states (memory-efficient).
   * Yields a snapshot after each delta is applied.
   *
   * @param checkpoint - Initial orderbook state
   * @param deltas - Array of delta updates
   * @param options - Reconstruction options
   * @yields Reconstructed orderbook snapshots
   */
  *iterate(
    checkpoint: OrderBook,
    deltas: OrderbookDelta[],
    options: ReconstructOptions = {}
  ): Generator<ReconstructedOrderBook> {
    const { depth } = options;

    this.initialize(checkpoint);

    // Yield initial state
    yield this.getSnapshot(depth);

    // Sort deltas by sequence
    const sortedDeltas = [...deltas].sort((a, b) => a.sequence - b.sequence);

    for (const delta of sortedDeltas) {
      this.applyDelta(delta);
      yield this.getSnapshot(depth);
    }
  }

  /**
   * Get the final reconstructed state without intermediate snapshots.
   * Most efficient when you only need the end result.
   *
   * @param checkpoint - Initial orderbook state
   * @param deltas - Array of delta updates
   * @param depth - Maximum price levels to include
   * @returns Final orderbook state after all deltas applied
   */
  reconstructFinal(
    checkpoint: OrderBook,
    deltas: OrderbookDelta[],
    depth?: number
  ): ReconstructedOrderBook {
    this.initialize(checkpoint);

    // Sort and apply all deltas
    const sortedDeltas = [...deltas].sort((a, b) => a.sequence - b.sequence);
    for (const delta of sortedDeltas) {
      this.applyDelta(delta);
    }

    return this.getSnapshot(depth);
  }

  /**
   * Check for sequence gaps in deltas.
   * Returns array of missing sequence numbers.
   *
   * @param deltas - Array of delta updates
   * @returns Array of [expectedSeq, actualSeq] tuples where gaps exist
   */
  static detectGaps(deltas: OrderbookDelta[]): Array<[number, number]> {
    if (deltas.length < 2) return [];

    const sorted = [...deltas].sort((a, b) => a.sequence - b.sequence);
    const gaps: Array<[number, number]> = [];

    for (let i = 1; i < sorted.length; i++) {
      const expected = sorted[i - 1].sequence + 1;
      const actual = sorted[i].sequence;
      if (actual !== expected) {
        gaps.push([expected, actual]);
      }
    }

    return gaps;
  }
}

/**
 * Convenience function for one-shot reconstruction.
 * Creates a new reconstructor, processes data, and returns snapshots.
 *
 * @param tickData - Checkpoint and deltas from API
 * @param options - Reconstruction options
 * @returns Array of reconstructed orderbook snapshots
 */
export function reconstructOrderBook(
  tickData: TickData,
  options: ReconstructOptions = {}
): ReconstructedOrderBook[] {
  const reconstructor = new OrderBookReconstructor();
  return reconstructor.reconstructAll(tickData.checkpoint, tickData.deltas, options);
}

/**
 * Convenience function to get final orderbook state.
 *
 * @param tickData - Checkpoint and deltas from API
 * @param depth - Maximum price levels
 * @returns Final orderbook state
 */
export function reconstructFinal(
  tickData: TickData,
  depth?: number
): ReconstructedOrderBook {
  const reconstructor = new OrderBookReconstructor();
  return reconstructor.reconstructFinal(tickData.checkpoint, tickData.deltas, depth);
}
