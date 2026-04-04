/**
 * L4 order book reconstructor with matching engine.
 *
 * Reconstructs Hyperliquid and HIP-3 L4 order books from checkpoints and diffs.
 * The same class works for both exchanges — the diff format is identical.
 *
 * When a new order crosses the spread, the matching engine filled opposite-side
 * orders at crossing prices. Without removing them, the reconstructed book will
 * be "crossed" (best bid > best ask).
 *
 * Ref: https://github.com/hyperliquid-dex/order_book_server
 */

export interface L4Order {
  oid: number;
  userAddress: string;
  side: 'B' | 'A';
  price: number;
  size: number;
}

export interface L2Level {
  px: number;
  sz: number;
  n: number;
}

export interface L4Diff {
  // Supports both snake_case (raw API) and camelCase (SDK-transformed)
  diff_type?: 'new' | 'update' | 'remove';
  diffType?: 'new' | 'update' | 'remove';
  oid: number;
  side: 'B' | 'A';
  price: number;
  new_size?: number | null;
  newSize?: number | null;
  user_address?: string;
  userAddress?: string;
  block_number?: number;
  blockNumber?: number;
}

export interface L4Checkpoint {
  bids: Array<{ oid: number; user_address?: string; userAddress?: string; side: string; price: number; size: number }>;
  asks: Array<{ oid: number; user_address?: string; userAddress?: string; side: string; price: number; size: number }>;
}

/**
 * L4 orderbook reconstructor with matching engine.
 *
 * Works identically for Hyperliquid and HIP-3 — same diff format,
 * same checkpoint format, same crossing logic.
 *
 * @example
 * ```typescript
 * const book = new L4OrderBookReconstructor();
 * book.loadCheckpoint(checkpoint);
 *
 * // Group diffs by block, apply in order
 * for (const bn of sortedBlockNumbers) {
 *   const nr = nonRestingByBlock.get(bn);
 *   for (const diff of blocks.get(bn)!) {
 *     book.applyDiff(diff, nr);
 *   }
 * }
 *
 * console.log(book.isCrossed()); // false
 * const { bids: l2Bids, asks: l2Asks } = book.deriveL2();
 * ```
 */
export class L4OrderBookReconstructor {
  private orders = new Map<number, L4Order>();
  private bidPrices = new Map<number, Set<number>>();
  private askPrices = new Map<number, Set<number>>();

  /** Initialize from an L4 checkpoint. */
  loadCheckpoint(checkpoint: L4Checkpoint): void {
    this.orders.clear();
    this.bidPrices.clear();
    this.askPrices.clear();

    for (const order of [...checkpoint.bids, ...checkpoint.asks]) {
      const oid = order.oid;
      const price = Number(order.price);
      const size = Number(order.size);
      const side = order.side as 'B' | 'A';

      this.orders.set(oid, {
        oid,
        userAddress: order.user_address ?? order.userAddress ?? '',
        side,
        price,
        size,
      });

      const priceMap = side === 'B' ? this.bidPrices : this.askPrices;
      if (!priceMap.has(price)) priceMap.set(price, new Set());
      priceMap.get(price)!.add(oid);
    }
  }

  /** Apply a single L4 diff with matching engine. */
  applyDiff(diff: L4Diff, nonRestingOids?: Set<number>): void {
    const dt = diff.diff_type ?? diff.diffType;
    const oid = diff.oid;

    if (dt === 'new') {
      if (nonRestingOids?.has(oid)) return;
      const newSize = diff.new_size ?? diff.newSize;
      if (newSize == null || newSize <= 0) return;

      const { side, price } = diff;
      const sz = newSize;

      // Matching engine: remove crossing opposite-side orders
      if (side === 'B') {
        for (const [askPx, oids] of this.askPrices) {
          if (askPx <= price) {
            for (const crossedOid of oids) this.orders.delete(crossedOid);
            this.askPrices.delete(askPx);
          }
        }
      } else {
        for (const [bidPx, oids] of this.bidPrices) {
          if (bidPx >= price) {
            for (const crossedOid of oids) this.orders.delete(crossedOid);
            this.bidPrices.delete(bidPx);
          }
        }
      }

      this.orders.set(oid, {
        oid,
        userAddress: diff.user_address ?? diff.userAddress ?? '',
        side,
        price,
        size: sz,
      });

      const priceMap = side === 'B' ? this.bidPrices : this.askPrices;
      if (!priceMap.has(price)) priceMap.set(price, new Set());
      priceMap.get(price)!.add(oid);

    } else if (dt === 'update') {
      const order = this.orders.get(oid);
      const updSize = diff.new_size ?? diff.newSize;
      if (order && updSize != null) {
        order.size = updSize;
      }

    } else if (dt === 'remove') {
      const order = this.orders.get(oid);
      if (order) {
        this.orders.delete(oid);
        const priceMap = order.side === 'B' ? this.bidPrices : this.askPrices;
        const oids = priceMap.get(order.price);
        if (oids) {
          oids.delete(oid);
          if (oids.size === 0) priceMap.delete(order.price);
        }
      }
    }
  }

  /** Return bids sorted by price descending. */
  bids(): L4Order[] {
    return [...this.orders.values()]
      .filter(o => o.side === 'B' && o.size > 0)
      .sort((a, b) => b.price - a.price);
  }

  /** Return asks sorted by price ascending. */
  asks(): L4Order[] {
    return [...this.orders.values()]
      .filter(o => o.side === 'A' && o.size > 0)
      .sort((a, b) => a.price - b.price);
  }

  bestBid(): number | null {
    const b = this.bids();
    return b.length > 0 ? b[0].price : null;
  }

  bestAsk(): number | null {
    const a = this.asks();
    return a.length > 0 ? a[0].price : null;
  }

  /** Check if the book is crossed. Should be false after correct reconstruction. */
  isCrossed(): boolean {
    const bb = this.bestBid();
    const ba = this.bestAsk();
    return bb != null && ba != null && bb >= ba;
  }

  get bidCount(): number {
    return [...this.orders.values()].filter(o => o.side === 'B' && o.size > 0).length;
  }

  get askCount(): number {
    return [...this.orders.values()].filter(o => o.side === 'A' && o.size > 0).length;
  }

  /** Aggregate L4 orders into L2 price levels. */
  deriveL2(): { bids: L2Level[]; asks: L2Level[] } {
    const bidAgg = new Map<number, { sz: number; n: number }>();
    const askAgg = new Map<number, { sz: number; n: number }>();

    for (const o of this.orders.values()) {
      if (o.size <= 0) continue;
      const agg = o.side === 'B' ? bidAgg : askAgg;
      const existing = agg.get(o.price);
      if (existing) {
        existing.sz += o.size;
        existing.n += 1;
      } else {
        agg.set(o.price, { sz: o.size, n: 1 });
      }
    }

    const bids: L2Level[] = [...bidAgg.entries()]
      .sort(([a], [b]) => b - a)
      .map(([px, v]) => ({ px, sz: v.sz, n: v.n }));

    const asks: L2Level[] = [...askAgg.entries()]
      .sort(([a], [b]) => a - b)
      .map(([px, v]) => ({ px, sz: v.sz, n: v.n }));

    return { bids, asks };
  }
}
