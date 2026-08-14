import { istToday } from "@/lib/format";

/**
 * A sheet records a shift that has already been worked, so its business date
 * can never be ahead of today in IST.
 *
 * This lives on the server side of both the create and the edit route, not
 * just as `max` on the date picker: `max` is a hint the browser enforces, and
 * a phone with a wrong clock, an autofilled value, or any hand-made request
 * walks straight past it. A future-dated sheet is expensive to notice — it
 * sits outside every date filter that stops at today.
 *
 * Nobody is exempt, admins included. There is no legitimate reason to file a
 * sheet for a day that hasn't happened; correcting one that was mis-dated
 * means moving it *back*, which this allows.
 */

export const FUTURE_DATE_ERROR =
  "That date hasn't happened yet — a sheet can only be filed for today or an earlier day.";

/** `date` is a YYYY-MM-DD business date; comparison is safe as ISO strings sort. */
export const isFutureBusinessDate = (date: string): boolean => date > istToday();
