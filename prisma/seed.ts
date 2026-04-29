import { v4 as uuid } from "uuid";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Relayroom Demo Tenant"
    }
  });

  const incidentId = uuid();
  const roomId = uuid();

  // Create the incident first (without roomId) so FK constraints are satisfied,
  // then create the room, then link the incident back to the room.
  const incident = await prisma.incident.create({
    data: {
      id: incidentId,
      tenantId: tenant.id,
      externalId: "INC-DEMO-1001",
      title: "Payments API latency spike",
      service: "payments-api",
      severity: "sev1",
      phase: "mitigating",
      elapsedMinutes: 18,
      roomId: null
    }
  });

  await prisma.room.create({
    data: {
      id: roomId,
      tenantId: tenant.id,
      incidentId: incident.id,
      roles: {
        incident_commander: "ic@relayroom.dev",
        comms_lead: "comms@relayroom.dev",
        ops_lead: "ops@relayroom.dev",
        service_owner: "owner@relayroom.dev",
        executive_observer: "vp-ops@relayroom.dev"
      },
      unresolvedBlockers: ["Confirm full cache propagation after rollback"],
      latestHypothesis: "Recent deployment increased DB connection churn.",
      mitigationPlan: "Rollback + cache warm-up + synthetic verification."
    }
  });

  await prisma.incident.update({
    where: { id: incident.id },
    data: { roomId }
  });

  await prisma.timelineEvent.createMany({
    data: [
      {
        id: uuid(),
        tenantId: tenant.id,
        incidentId,
        type: "incident_sync",
        message: "ServiceNow sync: INC-DEMO-1001 sev1 mitigating",
        source: "servicenow"
      },
      {
        id: uuid(),
        tenantId: tenant.id,
        incidentId,
        type: "room_created",
        message: "Relayroom response room auto-created and roles initialized.",
        source: "relayroom"
      }
    ]
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
