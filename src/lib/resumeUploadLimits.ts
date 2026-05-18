const MB = 1024 * 1024

/** Maximum resume upload size. PDFs and Word docs rarely exceed this; caps storage and abuse. */
export const RESUME_MAX_FILE_BYTES = 10 * MB

export function resumeMaxSizeLabel(): string {
  return `${RESUME_MAX_FILE_BYTES / MB} MB`
}

/** Returns an error message if the file is too large, otherwise `null`. */
export function resumeFileSizeErrorIfAny(file: File): string | null {
  if (file.size > RESUME_MAX_FILE_BYTES) {
    return `That file is too large. Resumes must be ${resumeMaxSizeLabel()} or smaller.`
  }
  return null
}
