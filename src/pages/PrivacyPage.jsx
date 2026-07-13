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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold">Your Student Companion</span>
          </Link>
          <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground">
            Terms of Service
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Privacy Policy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your Student Companion ("YSC", "we") is a study app. This policy explains, in plain
            language, what information the app handles and why. The short version: we collect the
            minimum needed to run your study tools, we never sell your data, and you can delete
            everything yourself from Settings.
          </p>
        </div>

        <Section title="What we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="text-foreground">Account:</span> your email address and display name,
              handled by our sign-in provider (Clerk).
            </li>
            <li>
              <span className="text-foreground">Profile:</span> grade level, subjects, weekly study
              goal, timezone, and semester start date — the things you enter during onboarding.
            </li>
            <li>
              <span className="text-foreground">Study activity:</span> the tasks, notes, flashcards,
              planner blocks, focus sessions, and reminders you create. This is your data; we store
              it to show it back to you.
            </li>
            <li>
              <span className="text-foreground">AI mentor conversations:</span> messages you send to
              the mentor are processed by OpenAI to generate replies, and voice sessions are
              processed by ElevenLabs. We log conversations and token counts to run daily usage
              limits and improve safety.
            </li>
            <li>
              <span className="text-foreground">Payments:</span> handled entirely by Stripe. Card
              numbers never touch our servers; we store only your purchase and subscription status.
            </li>
            <li>
              <span className="text-foreground">Product analytics:</span> a small set of named events
              (like "task created" or "focus session completed") tied to your account ID only — never
              your email. Automatic click tracking and session recording are turned off, and we
              respect your browser's Do Not Track setting. We use PostHog for this.
            </li>
            <li>
              <span className="text-foreground">Error reports:</span> when something breaks, Sentry
              receives a crash report tagged with your account ID. We strip emails, auth tokens, and
              cookies from these reports before they leave your browser.
            </li>
          </ul>
        </Section>

        <Section title="What we never do">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>We never sell your personal information.</li>
            <li>We never show targeted advertising.</li>
            <li>We never use your notes or chats to advertise to you.</li>
          </ul>
        </Section>

        <Section title="Who processes data for us">
          <p>
            We rely on a small set of service providers, each receiving only what their job
            requires: Clerk (sign-in), Supabase (database and storage), Stripe (payments), OpenAI
            (AI mentor text), ElevenLabs (AI mentor voice), Sentry (error monitoring), PostHog
            (product analytics), Vercel and Render (hosting).
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            YSC is intended for students aged 13 and older. We do not knowingly collect personal
            information from children under 13. If you believe a child under 13 has created an
            account, contact us at {CONTACT_EMAIL} and we will delete it. School or district
            deployments involving younger students require a separate agreement with us first.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>
            Settings → Danger Zone → "Delete my account and data" permanently erases your profile,
            tasks, notes, flashcards, planner, focus history, reminders, and AI conversations, and
            cancels any active subscription. Your sign-in identity (email) is managed by Clerk; to
            have that removed too, email {CONTACT_EMAIL} and we will complete it within 30 days.
          </p>
        </Section>

        <Section title="Data retention & security">
          <p>
            We keep your data for as long as your account exists. Everything travels over HTTPS,
            database access is restricted per-user with row-level security, and payment secrets
            live only with Stripe.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can access and edit your data in the app at any time, export your notes and tasks by
            request, delete everything yourself, and ask us questions at {CONTACT_EMAIL}. If you're
            in a region with specific privacy rights (like GDPR or state privacy laws), we honor
            access, correction, deletion, and portability requests through the same contact.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change this policy in a meaningful way, we'll note it here with a new effective
            date and announce it in the app before it takes effect.
          </p>
        </Section>

        <p className="border-t border-border/40 pt-6 text-sm text-muted-foreground">
          Questions? Email <span className="text-foreground">{CONTACT_EMAIL}</span>.
        </p>
      </main>
    </div>
  );
}
