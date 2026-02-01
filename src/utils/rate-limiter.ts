export class RateLimiter {
  private static instance: RateLimiter;
  private requestTimes: number[] = [];
  private readonly maxRequests = 20; // DeepSeek free model limit
  private readonly windowMs = 60000; // 1 minute window

  private constructor() {}

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  public async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Remove requests outside the time window
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    
    // If we're at the limit, wait until we can make another request
    if (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // Add small buffer
      
      console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Clean up after waiting
      const newNow = Date.now();
      this.requestTimes = this.requestTimes.filter(time => newNow - time < this.windowMs);
    }
    
    // Record this request
    this.requestTimes.push(Date.now());
  }

  public getRequestCount(): number {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    return this.requestTimes.length;
  }

  public getRemainingRequests(): number {
    return Math.max(0, this.maxRequests - this.getRequestCount());
  }
}

export const rateLimiter = RateLimiter.getInstance();