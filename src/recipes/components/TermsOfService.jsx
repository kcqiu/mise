const sectionClass =
  "grid gap-4 border-t border-line py-8 first:border-t-0 min-[720px]:grid-cols-[180px_minmax(0,1fr)] min-[720px]:gap-10";
const headingClass =
  "font-serif text-[24px] font-normal leading-tight text-ink";
const copyClass = "space-y-4 text-[15px] leading-[1.75] text-muted";

export default function TermsOfService() {
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
          <p className="eyebrow mb-4">MISE / Using the app</p>
          <h1 className="mb-5 font-serif text-[clamp(44px,7vw,72px)] font-normal leading-[0.96] tracking-[-0.035em]">
            Terms of service.
          </h1>
          <p className="m-0 max-w-[630px] text-[17px] leading-[1.65] text-muted">
            These terms set the basic expectations for using MISE, a personal
            digital cookbook and grocery-list companion.
          </p>
          <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
            Last updated September 16, 2026
          </p>
        </div>

        <div aria-label="Terms of service details">
          <section className={sectionClass}>
            <h2 className={headingClass}>Using MISE</h2>
            <div className={copyClass}>
              <p>
                You may use MISE for personal cookbook, cooking, and grocery
                planning purposes. Use the service lawfully, do not interfere
                with its operation, and do not attempt to access another
                person&apos;s account or data.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Your recipes</h2>
            <div className={copyClass}>
              <p>
                You keep ownership of recipes, notes, and images you add. You
                give MISE permission to store, process, display, and sync that
                content only as needed to provide the service.
              </p>
              <p>
                Only add content you have the right to use. You are responsible
                for checking imported recipes and following appropriate food
                safety, allergy, and dietary guidance.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>AI-assisted tools</h2>
            <div className={copyClass}>
              <p>
                Optional AI features can help import, refine, or illustrate a
                recipe. Their output may be incomplete or inaccurate. Review
                generated ingredients, quantities, temperatures, timing, and
                safety guidance before relying on it.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Accounts</h2>
            <div className={copyClass}>
              <p>
                You are responsible for activity under your account and for
                keeping access to your Google account secure. MISE may restrict
                access when necessary to protect users, the service, or comply
                with law.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Availability</h2>
            <div className={copyClass}>
              <p>
                MISE is provided as available and may change, pause, or
                discontinue features. Reasonable care is taken to protect your
                cookbook, but uninterrupted service and permanent data storage
                cannot be guaranteed. Keep copies of recipes you cannot afford
                to lose.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Ending use</h2>
            <div className={copyClass}>
              <p>
                You may stop using MISE at any time. You can remove personal
                recipes and grocery data in the app and request deletion of
                remaining account data through the support contact identified
                in the privacy policy.
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={headingClass}>Changes</h2>
            <div className={copyClass}>
              <p>
                These terms may be updated as MISE evolves. The current
                effective date will appear at the top of this page. Continued
                use after an update means you accept the revised terms.
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
            href="/privacy"
            className="ml-auto font-medium underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
