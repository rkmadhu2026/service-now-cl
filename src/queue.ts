import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { RelayroomService } from "./service.js";
import type { Job } from "./types.js";

export interface JobQueue {
  add(job: Job): Promise<void>;
  close(): Promise<void>;
}

class InMemoryQueue implements JobQueue {
  constructor(private readonly service: RelayroomService) {}
  async add(job: Job) {
    this.service.pushJob(job);
  }
  async close() {}
}

class BullQueue implements JobQueue {
  private readonly queue: Queue<Job>;
  private readonly worker: Worker<Job>;
  constructor(redisUrl: string, service: RelayroomService) {
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<Job>("relayroom-jobs", { connection });
    this.worker = new Worker<Job>(
      "relayroom-jobs",
      async (job) => {
        await service.handleExternalJob(job.data);
      },
      { connection }
    );
  }
  async add(job: Job) {
    await this.queue.add(job.type, job);
  }
  async close() {
    await this.worker.close();
    await this.queue.close();
  }
}

export function createQueue(redisUrl: string | undefined, service: RelayroomService): JobQueue {
  if (!redisUrl) return new InMemoryQueue(service);
  return new BullQueue(redisUrl, service);
}
