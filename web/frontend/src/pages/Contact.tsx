import { useCallback, useMemo, useState } from "react"
import { SubmitHandler, useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

const ContactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Let us know who we are speaking with.")
    .max(80, "Keep the name under 80 characters."),
  email: z.string().trim().email("Provide a valid work email."),
  message: z
    .string()
    .trim()
    .min(20, "Share at least 20 characters of context for the response team.")
    .max(2000, "Please keep the message under 2000 characters.")
})

type ContactFormValues = z.infer<typeof ContactFormSchema>

type FieldSubmissionError = {
  field: keyof ContactFormValues
  message: string
}

function isFieldError(error: unknown): error is FieldSubmissionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "field" in error &&
    "message" in error &&
    typeof (error as { field: unknown }).field === "string" &&
    typeof (error as { message: unknown }).message === "string"
  )
}

function simulateContactSubmission(values: ContactFormValues) {
  return new Promise<void>((resolve, reject) => {
    window.setTimeout(() => {
      if (values.email.toLowerCase().endsWith("@invalid.com")) {
        reject({
          field: "email",
          message: "This email domain is blocked. Use your work address."
        } satisfies FieldSubmissionError)
        return
      }
      resolve()
    }, 650)
  })
}

export function ContactPage() {
  const [lastSubmission, setLastSubmission] = useState<ContactFormValues | null>(null)
  const [modalOpen, setModalOpen] = useState<ContactFormValues | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<ContactFormValues>({
    resolver: zodResolver<ContactFormValues, Record<string, never>, ContactFormValues>(ContactFormSchema),
    defaultValues: { name: "", email: "", message: "" }
  })

  const onSubmit: SubmitHandler<ContactFormValues> = async (values) => {
    try {
      await simulateContactSubmission(values)
      setLastSubmission(values)
      setModalOpen(values)
      reset({ name: "", email: "", message: "" })
    } catch (error) {
      if (isFieldError(error)) {
        setError(error.field, { type: "manual", message: error.message })
      } else {
        const message =
          error instanceof Error ? error.message : "Unable to submit your request. Please try again shortly."
        setError("message", { type: "manual", message })
      }
    }
  }

  const closeModal = useCallback(() => setModalOpen(null), [])

  const summaryDetails = useMemo(() => {
    if (!lastSubmission) {
      return null
    }
    return [
      { label: "Name", value: lastSubmission.name },
      { label: "Email", value: lastSubmission.email },
      { label: "Message", value: lastSubmission.message }
    ]
  }, [lastSubmission])

  return (
    <>
      <div className="contact">
        <header className="contact-header">
          <h2>Contact the response team</h2>
          <p>
            Reach out for anomaly snapshots, environment access, or dataset alignment questions. The team responds
            fastest when you share dataset size, context, and urgency.
          </p>
        </header>

        <section className="card-grid">
          <article className="card">
            <h3>Command desk</h3>
            <p>Email: abc123@gmail.com</p>
            <p>Phone: +61 432 232 456</p>
            <p>Hours: Mon-Fri 07:00 - 19:00 (AEDT), weekends on-call</p>
            {summaryDetails ? (
              <div className="contact-summary">
                <h4>Latest request</h4>
                <dl>
                  {summaryDetails.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </article>

          <article className="card">
            <h3>Send a note</h3>
            <form className="contact-form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <label className="form-field">
                Name
                <input
                  type="text"
                  placeholder="Jordan Analyst"
                  {...register("name")}
                  aria-invalid={errors.name ? "true" : "false"}
                />
                {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
              </label>
              <label className="form-field">
                Email
                <input
                  type="email"
                  placeholder="you@team.com"
                  {...register("email")}
                  aria-invalid={errors.email ? "true" : "false"}
                />
                {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
              </label>
              <label className="form-field">
                Message
                <textarea
                  rows={5}
                  placeholder="Share context, blockers, or access requests."
                  {...register("message")}
                  aria-invalid={errors.message ? "true" : "false"}
                />
                {errors.message ? <p className="field-error">{errors.message.message}</p> : null}
              </label>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send request"}
              </button>
            </form>
          </article>
        </section>
      </div>
      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="modal-card modal-card--success"
            role="dialog"
            aria-modal="true"
            aria-live="polite"
            onClick={(event) => event.stopPropagation()}
          >
            <h4>Request sent successfully</h4>
            <p>The response desk has logged your note and will follow up shortly.</p>
            <ul className="modal-list">
              <li>
                <strong>Name: </strong>
                {modalOpen.name}
              </li>
              <li>
                <strong>Email: </strong>
                {modalOpen.email}
              </li>
              <li>
                <strong>Message: </strong>
                {modalOpen.message}
              </li>
            </ul>
            <div className="modal-actions">
              <button type="button" className="primary-btn" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
