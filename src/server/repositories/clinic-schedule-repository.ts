import { prisma } from '@/lib/prisma'
import type { ClinicSchedule } from '@/modules/appointments/types'

export async function getClinicSchedule(clientId: string): Promise<ClinicSchedule> {
  const [client, holidays] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId },
      select: { workdayStart: true, workdayEnd: true, workdays: true },
    }),
    prisma.clinicHoliday.findMany({
      where: { clientId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, name: true },
    }),
  ])

  return {
    workdayStart: client?.workdayStart ?? '07:00',
    workdayEnd: client?.workdayEnd ?? '20:00',
    workdays: client?.workdays ?? [1, 2, 3, 4, 5, 6],
    holidays,
  }
}

export async function updateClinicSchedule(
  clientId: string,
  data: { workdayStart: string; workdayEnd: string; workdays: number[] }
) {
  return prisma.client.update({
    where: { id: clientId },
    data: {
      workdayStart: data.workdayStart,
      workdayEnd: data.workdayEnd,
      workdays: data.workdays,
    },
  })
}

export async function addClinicHoliday(clientId: string, data: { date: string; name: string }) {
  return prisma.clinicHoliday.upsert({
    where: { clientId_date: { clientId, date: data.date } },
    create: { clientId, date: data.date, name: data.name },
    update: { name: data.name },
  })
}

export async function removeClinicHoliday(clientId: string, holidayId: string) {
  return prisma.clinicHoliday.deleteMany({
    where: { id: holidayId, clientId },
  })
}
