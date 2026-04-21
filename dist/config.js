export const config = {
    port: Number(process.env.PORT ?? 4000),
    jwtSecret: process.env.JWT_SECRET ?? "relayroom-dev-secret",
    servicenowWebhookSecret: process.env.SERVICENOW_WEBHOOK_SECRET ?? "servicenow-dev-secret",
    slackWebhookSecret: process.env.SLACK_WEBHOOK_SECRET ?? "slack-dev-secret",
    redisUrl: process.env.REDIS_URL,
    usePrisma: process.env.USE_PRISMA === "true"
};
