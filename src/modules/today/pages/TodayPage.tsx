import { getToday, listNeedsYou } from "../queries";
import { PlanMyDay } from "../components/PlanMyDay";
import { NeedsYouQueue } from "../components/NeedsYouQueue";

/**
 * The command surface (ONE-STOP §3): one page answering "what's my day, and
 * what needs me?" — Plan-my-day on the left, the "Needs you" queue on the
 * right. Both are views over the same attention atoms + the calendar.
 */
export async function TodayPage() {
  const [{ agenda, suggestions }, needs] = await Promise.all([
    getToday(),
    listNeedsYou(),
  ]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <PlanMyDay agenda={agenda} suggestions={suggestions} />
      <NeedsYouQueue items={needs} />
    </div>
  );
}
