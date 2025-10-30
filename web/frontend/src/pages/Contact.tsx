export function ContactPage() {
  return (
    <div className="contact">
      <header className="contact-header">
        <h2>Contact the response team</h2>
        <p>
          Reach out for anomaly snapshots, environment access, or documentation updates. This static touchpoint mirrors
          the pre-integration design.
        </p>
      </header>

      <section className="card-grid">
        <article className="card">
          <h3>Command desk</h3>
          <p>Email: abc123@gmail.com</p>
          <p>Phone: +61 432 232 456</p>
          <p>Hours: Mon-Fri 07:00 - 19:00, weekends on-call</p>
        </article>
        <article className="card">
          <h3>Send a note</h3>
          <form className="contact-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              Name
              <input type="text" placeholder="Jordan Analyst" required />
            </label>
            <label>
              Email
              <input type="email" placeholder="you@team.com" required />
            </label>
            <label>
              Message
              <textarea rows={5} placeholder="Share context, blockers, or access requests." required />
            </label>
            <button type="submit">Send request</button>
          </form>
        </article>
      </section>
    </div>
  )
}
