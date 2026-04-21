import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
class InMemoryQueue {
    service;
    constructor(service) {
        this.service = service;
    }
    async add(job) {
        this.service.pushJob(job);
    }
    async close() { }
}
class BullQueue {
    queue;
    worker;
    constructor(redisUrl, service) {
        const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
        this.queue = new Queue("relayroom-jobs", { connection });
        this.worker = new Worker("relayroom-jobs", async (job) => {
            await service.handleExternalJob(job.data);
        }, { connection });
    }
    async add(job) {
        await this.queue.add(job.type, job);
    }
    async close() {
        await this.worker.close();
        await this.queue.close();
    }
}
export function createQueue(redisUrl, service) {
    if (!redisUrl)
        return new InMemoryQueue(service);
    return new BullQueue(redisUrl, service);
}
