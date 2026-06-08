// CONFIRMED_STATUSES: active/upcoming bookings a guest will actually show up for.
//   BOOKED / BOOKED_BY_AGENT / BOOKED_BY_CUSTOMER / BOOKED_EXTERNALLY — reservation confirmed
//   STAY — guest is currently checked in
export const CONFIRMED_STATUSES = new Set([
  'BOOKED',
  'BOOKED_BY_AGENT',
  'BOOKED_BY_CUSTOMER',
  'BOOKED_EXTERNALLY',
  'STAY',
]);
