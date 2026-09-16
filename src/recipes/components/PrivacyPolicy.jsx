const sectionClass =
  "grid gap-4 border-t border-line py-8 first:border-t-0 min-[720px]:grid-cols-[180px_minmax(0,1fr)] min-[720px]:gap-10";
const headingClass =
  "font-serif text-[24px] font-normal leading-tight text-ink";
const copyClass = "space-y-4 text-[15px] leading-[1.75] text-muted";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[76px] w-[min(1120px,calc(100%-48px))] items-center justify-between max-[580px]:w-[calc(100%-36px)]">
          <a
            href="/#/"
            className="mise-brand pb-1 font-serif text-[40px] font-medium leading-[0.9] text-ink no-underline"
            aria-label="mise. recipe shelf"
          >
            mise<span className="text-terracotta">.</span>
          </a>
          <a
            href="/#/"
            className="text-[13px] font-medium text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Back to the shelf
          </a>
        </div>
      </header>

      <main className="mx-auto w-[min(860px,calc(100%-48px))] py-16 max-[580px]:w-[calc(100%-36px)] max-[580px]:py-10">
        <div className="mb-12 max-w-[680px] max-[580px]:mb-8">
          <p className="eyebrow mb-4">MISE / Your data</p>
          <h1 className="mb-5 font-serif text-[clamp(44px,7vw,72px)] font-normal leading-[0.96] tracking-[-0.035em]">
            Privacy policy.
          </h1>
          <p className="m-0 max-w-[630px] text-[17px] leading-[1.65] text-muted">
            MISE is a personal digital cookbook. This policy explains what
            information the app uses, where it goes, and the choices you have.
          </p>
          <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
            Last updated September 16, 2026
          </p>
        </div>

        <div aria-label="Privacy policy details">
          <section className={sectionClass}>
            <h2 className={headingClass}>The short version</h2>
            <div className={copyClass}>
              <p>
                MISE uses your information to provide your cookbook, grocery
                list, account sync, and optional AI-assisted recipe tools. MISE
                does not sell personal information or use it for advertising.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Google sign-in</h2>
            <div className={copyClass}>
              <p>
                When you choose Google sign-in, MISE receives the basic account
                information needed to identify and display your account: your
                Google account identifier, email address, name, and profile
                image. MISE does not request access to Gmail, Google Drive,
                contacts, calendars, or other Google services.
              </p>
              <p>
                This information is used only for authentication, account
                display, and connecting your saved MISE data to the correct
                account. MISE&apos;s use and transfer of information received from
                Google APIs follows the Google API Services User Data Policy,
                including its Limited Use requirements.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Cookbook data</h2>
            <div className={copyClass}>
              <p>
                MISE may store recipes you create or import, recipe images,
                favorites, cooking progress, grocery lists, custom grocery
                items, and related preferences. Signed-in data is associated
                with your account so it can sync across devices.
              </p>
              <p>
                If you browse as a guest, cookbook and grocery information is
                stored in your browser. Your browser may also retain a local
                device identifier and pending sync changes needed for offline
                grocery-list behavior.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Optional AI tools</h2>
            <div className={copyClass}>
              <p>
                When you intentionally use an AI feature—such as importing a
                recipe from text or an image, refining a recipe, or generating
                cover art—the recipe content or prompt required for that action
                is sent to the applicable AI provider. MISE currently uses
                Google Gemini for recipe analysis and Cloudflare Workers AI for
                generated cover images.
              </p>
              <p>
                MISE does not send your cookbook to an AI provider simply
                because you view, edit, or cook from a recipe.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Service providers</h2>
            <div className={copyClass}>
              <p>
                MISE relies on Google Identity Services for sign-in, Supabase
                for authentication and cloud data storage, and Vercel for app
                hosting and server functions. These providers may process the
                limited account, content, and technical request information
                needed to operate their services.
              </p>
              <p>
                Information may also be disclosed when required by law, to
                protect users, or to maintain the security and integrity of the
                service. It is not shared with data brokers or advertising
                networks.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Retention and security</h2>
            <div className={copyClass}>
              <p>
                Guest data remains in your browser until you clear it. Cloud
                data is retained while your account is active or as needed to
                provide the service. Deleting a personal recipe removes it from
                your cookbook; limited backups or provider logs may persist for
                a reasonable period.
              </p>
              <p>
                MISE uses account-based access controls, encrypted network
                connections, and database row-level security. No online service
                can guarantee absolute security, but access is limited to what
                is needed to operate the app.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Your choices</h2>
            <div className={copyClass}>
              <p>
                You can use the recipe shelf without signing in, remove recipes
                and grocery items within the app, clear guest data through your
                browser, or disconnect MISE from your Google Account settings.
              </p>
              <p>
                To request deletion of your MISE account profile and remaining
                cloud data, use the support contact shown on the MISE Google
                sign-in consent screen. Privacy questions and deletion requests
                are handled through that same contact.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Policy changes</h2>
            <div className={copyClass}>
              <p>
                This page may be updated when MISE&apos;s features or providers
                change. The current effective date will always appear near the
                top of the policy.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex min-h-[96px] w-[min(1120px,calc(100%-48px))] items-center gap-5 text-[12px] text-muted max-[580px]:w-[calc(100%-36px)]">
          <span className="font-serif text-[28px] font-medium text-ink">
            mise<span className="text-terracotta">.</span>
          </span>
          <span>A personal cookbook, kept close.</span>
          <a
            href="/terms"
            className="ml-auto font-medium underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
