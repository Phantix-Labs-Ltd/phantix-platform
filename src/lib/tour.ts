/**
 * The Platform's guided tour.
 *
 * Steps point at `data-tour` anchors in Layout: `nav-<section>` (a sidebar
 * group, slugged from its label), `launch-app` and `account`. An anchor that is
 * not on screen (the sidebar is a drawer on phones) shows its step as a centred
 * card. Bump TOUR_VERSION when the tour changes enough to show it again.
 */
import type { TourStep } from "@/components/GuidedTour";

export const TOUR_VERSION = 1;
export const TOUR_STORAGE_KEY = `sg.tour.platform.v${TOUR_VERSION}`;

export const navAnchor = (label: string) =>
  `nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

export const PLATFORM_TOUR: TourStep[] = [
  {
    title: "Welcome to the Platform",
    body: "The Platform is where you manage your organization: keys, people, the security database, applications and billing. The security work itself happens in the product apps. This tour takes about a minute.",
  },
  {
    anchor: navAnchor("Organization"),
    title: "Set up your organization",
    body: "Create your keys, invite people and choose solo mode or dual control, connect your security database, and switch on the applications you need.",
  },
  {
    anchor: navAnchor("Commerce"),
    title: "Tools, billing and support",
    body: "See the tool catalog, manage your plan and invoices, and contact support.",
  },
  {
    anchor: navAnchor("Governance"),
    title: "Governance",
    body: "Set how the AI may work for you, choose who gets which alerts, and read the audit trail of every action.",
  },
  {
    anchor: navAnchor("Integrations"),
    title: "Connect your tools",
    body: "The integrations hub connects source control, ticketing and chat, so findings reach the people who fix them.",
  },
  {
    anchor: "launch-app",
    title: "Open the product",
    body: "When your organization is set up, open the Command Centre to find and fix security issues. You stay signed in.",
  },
  {
    anchor: "account",
    title: "Your account",
    body: "Sign out here. Choose “Take the tour” to see this tour again.",
  },
];
