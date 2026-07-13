import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

const EFFECTIVE_DATE = "July 13, 2026";
const CONTACT_EMAIL = "support@truthjblue.com";

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold">Your Student Companion</span>
          </Link>
          <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Terms of Service</h1>
          <p className="mt-1 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            These terms are a simple agreement between you and Your Student Companion ("YSC",
            "we"). By creating an account or using the app, you agree to them.
          </p>
        </div>

        <Section title="Who can use YSC">
          <p>
            You must be at least 13 years old. If you're under 18, you should have a parent or
            guardian's permission. School or district deployments need a separate agreement.
          </p>
        </Section>

        <Section title="What YSC is (and isn't)">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              YSC gives you study tools — a task board, planner, focus timer, notes with flashcards,
              progress reports — and an AI study mentor.
            </li>
            <li>
              <span className="text-foreground">The AI mentor is a study coach, not an oracle.</span>{" "}
              It can be wrong. Check important answers against your class materials.
            </li>
            <li>
              The mentor is not a medical, mental-health, legal, or financial professional and its
              responses are not professional advice.
            </li>
            <li>
              <span className="text-foreground">Academic integrity:</span> YSC is built to help you
              learn, not to do graded work for you. You're responsible for following your school's
              honor code. We may limit features that we see being used to cheat.
            </li>
          </ul>
        </Section>

        <Section title="Your account">
          <p>
            Keep your sign-in credentials to yourself. You're responsible for activity on your
            account. Tell us at {CONTACT_EMAIL} if you think someone else is using it.
          </p>
        </Section>

        <Section title="Subscriptions & purchases">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The core study tools are free to start. Optional subscriptions and course packs unlock
              additional content and features.
            </li>
            <li>
              Payments are processed by Stripe. Subscriptions renew automatically until you cancel;
              your first subscription includes a 14-day free trial, and you can cancel anytime from
              the billing portal — access continues through the period you've paid for.
            </li>
            <li>
              If a purchase goes wrong (double charge, content you never received), contact us and
              we'll make it right.
            </li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p>
            Don't break the law, probe or disrupt the service, scrape other users' data, upload
            malicious content, or harass anyone through any feature. We can suspend accounts that
            do.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            Your notes, tasks, and study data belong to you. You give us permission to store and
            process them solely to run the service (that's what makes the app work). Delete your
            account and that permission ends with it.
          </p>
        </Section>

        <Section title="Disclaimers & limits">
          <p>
            YSC is provided "as is". We work hard to keep it reliable, but we can't promise
            uninterrupted service or perfect AI answers. To the fullest extent allowed by law, our
            total liability for any claim is limited to what you paid us in the twelve months before
            the claim.
          </p>
        </Section>

        <Section title="Ending the agreement">
          <p>
            You can stop using YSC and delete your account at any time (Settings → Danger Zone). We
            may suspend or terminate accounts that violate these terms, with notice where
            practical.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If we change these terms in a meaningful way, we'll update the effective date and
            announce it in the app before the change applies.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the United States and the state in which the
            operator of Your Student Companion resides, without regard to conflict-of-law rules.
          </p>
        </Section>

        <p className="border-t border-border/40 pt-6 text-sm text-muted-foreground">
          Questions? Email <span className="text-foreground">{CONTACT_EMAIL}</span>.
        </p>
      </main>
    </div>
  );
}
