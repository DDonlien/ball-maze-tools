export class SeededRandom {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(items: T[]): T {
    if (items.length === 0) throw new Error("Cannot choose from an empty array.");
    return items[this.int(0, items.length - 1)];
  }
}
