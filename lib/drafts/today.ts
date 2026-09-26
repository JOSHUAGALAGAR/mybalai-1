/** Today's date in the Philippines as YYYY-MM-DD (what a date input and a rate's start date use). */
export const todayInManila = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date(),
  )
