import { Prisma } from "@/app/generated/prisma/client";

type DecimalLike = Prisma.Decimal | number | string;

export function computeManagerSlotPrice(
  managerOccupiesSlot: boolean,
  managerBasePrice: DecimalLike | null | undefined,
  override: DecimalLike | null | undefined
): Prisma.Decimal {
  if (!managerOccupiesSlot) return new Prisma.Decimal(0);
  if (override != null) return new Prisma.Decimal(override);
  if (managerBasePrice != null) return new Prisma.Decimal(managerBasePrice);
  return new Prisma.Decimal(0);
}

export function computeReserveUnit(
  categories: { basePrice: DecimalLike }[]
): Prisma.Decimal {
  if (categories.length === 0) return new Prisma.Decimal(0);
  return categories.reduce<Prisma.Decimal>((min, cat) => {
    const price = new Prisma.Decimal(cat.basePrice);
    return price.lessThan(min) ? price : min;
  }, new Prisma.Decimal(categories[0].basePrice));
}

export function remainingSlots(entry: { slotsTotal: number; slotsFilled: number }): number {
  return entry.slotsTotal - entry.slotsFilled;
}
