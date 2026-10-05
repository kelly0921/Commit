import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { PaymentSpike } from './model.js';

// One process owns this JSON store; all service operations share its queue.
export class PaymentStore {
  private records: PaymentSpike[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private lock?: Awaited<ReturnType<typeof open>>;
  constructor(private directory: string) {}
  async init() {
    await mkdir(this.directory, { recursive: true });
    try { this.lock = await open(join(this.directory, 'spike.lock'), 'wx', 0o600); }
    catch { throw new Error('Payment store is locked. Stop the other server, or remove data/spike.lock only after confirming no server is running.'); }
    try {
      await this.lock.writeFile(String(process.pid));
      try {
        const document = JSON.parse(await readFile(join(this.directory, 'payments.json'), 'utf8'));
        if (document.version !== 1 || !Array.isArray(document.payments)) throw new Error('Unsupported payment store format');
        this.records = document.payments;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    } catch (error) { await this.close(); throw error; }
  }
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
  list(): PaymentSpike[] { return structuredClone(this.records); }
  get(id: string): PaymentSpike | undefined { return this.list().find(record => record.id === id); }
  async save(record: PaymentSpike) {
    const next = this.list().filter(item => item.id !== record.id);
    next.push(structuredClone(record));
    const temporary = join(this.directory, 'payments.json.tmp');
    const file = await open(temporary, 'w', 0o600);
    try { await file.writeFile(JSON.stringify({ version: 1, payments: next }, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, join(this.directory, 'payments.json'));
    this.records = next;
  }
  async close() {
    await this.tail;
    if (this.lock) { await this.lock.close(); this.lock = undefined; await rm(join(this.directory, 'spike.lock'), { force: true }); }
  }
}
