import type { OverviewData } from '../_lib/overview';
import { OverviewChecklist } from './OverviewChecklist';
import { OverviewDashboard } from './OverviewDashboard';

/**
 * web-shell.md's two Overview states. The wireframe's own trigger condition
 * ("until enough of the budget is filled in... or dismissed") can't be
 * reached literally yet — every "beyond minimum" checklist section
 * (accounts, saving jars, ...) has no task shipped, so nothing can ever
 * populate them, and this task doesn't add a persisted dismiss action (not
 * asked for, and inventing one now would be scope creep for a screen this
 * phase of the build can't otherwise reach anyway). The signal used
 * instead — has the user logged at least one expense — is reachable today
 * (the DB/actions layer accepts transactions since L.3, even though L.6's
 * dialog hasn't shipped) and matches the wireframe's own spirit: tracking
 * expenses is what "using the budget for real" means here.
 */
export function OverviewView({ data }: { data: OverviewData }) {
  if (data.transactionCount === 0) {
    return <OverviewChecklist items={data.checklist} />;
  }
  return <OverviewDashboard data={data} />;
}
