import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'
import { supabase } from '@/lib/supabase'

/** Normalize phone to digits only for storage and uniqueness checks. */
export function normalizePhoneToDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** Default country when user does not select one (e.g. US for "555-123-4567"). */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'US'

export interface PhoneValidationResult {
  valid: boolean
  error?: string
  /** E.164 digits only (e.g. "15551234567") when valid. */
  normalized?: string
}

export interface PhoneCountryOption {
  value: CountryCode
  label: string
  callingCode: string
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Build sorted list of country options for the country-code dropdown (label: "Country name (+code)"). */
export function getPhoneCountryOptions(): PhoneCountryOption[] {
  const countries = getCountries()
  const options: PhoneCountryOption[] = countries.map((code) => {
    const callingCode = getCountryCallingCode(code)
    const name = regionNames.of(code) ?? code
    return { value: code, label: `${name} (+${callingCode})`, callingCode }
  })
  options.sort((a, b) => a.label.localeCompare(b.label))
  const usIndex = options.findIndex((o) => o.value === 'US')
  if (usIndex > 0) {
    const [us] = options.splice(usIndex, 1)
    options.unshift(us)
  }
  return options
}

/**
 * Validates and normalizes a phone number. Uses libphonenumber for format and length rules.
 * @param value Raw input (e.g. "(555) 123-4567", "+44 20 7946 0958")
 * @param country Default country when value has no country code (from the country dropdown).
 */
export function validatePhoneNumber(
  value: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): PhoneValidationResult {
  const trimmed = value.trim()
  if (!trimmed) {
    return { valid: false, error: 'Phone number is required' }
  }
  const parsed = parsePhoneNumberFromString(trimmed, country)
  if (!parsed) {
    return { valid: false, error: 'Please enter a valid phone number' }
  }
  if (!parsed.isValid()) {
    return { valid: false, error: 'Please enter a valid phone number' }
  }
  const normalized = parsed.format('E.164').replace(/\D/g, '')
  return { valid: true, normalized }
}

export const authAPI = {
  /** Returns true if the phone number is available (not already registered). */
  async checkPhoneAvailable(normalizedPhone: string): Promise<{ available: boolean; error: Error | null }> {
    if (normalizedPhone.length < 10) {
      return { available: true, error: null }
    }
    const { data, error } = await supabase.rpc('check_phone_available', {
      phone_input: normalizedPhone,
    })
    if (error) {
      return { available: false, error }
    }
    return { available: data === true, error: null }
  },

  async signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phoneNumber?: string,
    emailRedirectTo?: string,
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirectTo ?? `${window.location.origin}/dashboard`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber || null,
        },
      },
    })

    if (error) {
      console.error('Auth signUp error:', error.message, error)
    }

    return { data, error }
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    return { data, error }
  },

  /**
   * Sends a password recovery email. The link returns the user to `/reset-password`
   * where Supabase consumes the recovery token and establishes a temporary session.
   * Always resolves without disclosing whether the email is registered.
   */
  async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    return { error }
  },

  /** Sets a new password for the currently authenticated (or recovery-session) user. */
  async updatePassword(newPassword: string) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    return { data, error }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  async getCurrentUser() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    return { user, error }
  },
}

export function onAuthStateChange(
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0],
) {
  return supabase.auth.onAuthStateChange(callback)
}

