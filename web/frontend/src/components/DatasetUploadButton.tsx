import { ChangeEvent, useRef, useState } from "react"

type DatasetUploadButtonProps = {
  buttonText?: string
  className?: string
  buttonClassName?: string
  accept?: string
  helperText?: string
  onFileSelected?: (file: File) => void
  disabled?: boolean
}

export function DatasetUploadButton({
  buttonText = "Upload dataset",
  className = "",
  buttonClassName = "secondary-btn",
  accept = ".csv",
  helperText,
  onFileSelected,
  disabled = false
}: DatasetUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [status, setStatus] = useState<string>("")

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv")

    if (!isCsv) {
      setStatus("Only CSV files are supported.")
      event.target.value = ""
      return
    }

    setStatus(`Selected ${file.name}`)
    try {
      const maybePromise = onFileSelected?.(file)
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
        await maybePromise
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload dataset."
      setStatus(message)
      throw error
    } finally {
      event.target.value = ""
    }
  }

  return (
    <div className={`dataset-upload ${className}`.trim()}>
      <button className={buttonClassName} type="button" onClick={handleClick} disabled={disabled}>
        {buttonText}
      </button>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={handleChange} />
      {helperText ? <p className="upload-helper">{helperText}</p> : null}
      {status ? (
        <p className="upload-status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  )
}
