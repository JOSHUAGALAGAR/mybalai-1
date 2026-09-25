import { describe, expect, it } from 'vitest'

import {
  appReturnRedirect,
  bridgeUrl,
  isAllowedAppReturnUrl,
  isPaymentReturnResult,
  resolveCheckoutOrigin,
} from '@/lib/paymongo/mobile-return'

const prod = { production: true }
const dev = { production: false }

describe('isAllowedAppReturnUrl', () => {
  it('accepts the app scheme everywhere', () => {
    expect(isAllowedAppReturnUrl('mybalaimobile://payment-return', prod)).toBe(
      true,
    )
    expect(isAllowedAppReturnUrl('mybalaimobile://payment-return', dev)).toBe(
      true,
    )
  })

  it('accepts Expo Go / dev-client schemes only outside production', () => {
    for (const url of [
      'exp://192.168.1.19:8081/--/payment-return',
      'exp+mybalaimobile://expo-development-client/?url=x',
    ]) {
      expect(isAllowedAppReturnUrl(url, dev)).toBe(true)
      expect(isAllowedAppReturnUrl(url, prod)).toBe(false)
    }
  })

  it.each([
    ['https://evil.example/phish'],
    ['http://localhost:3000/x'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>1</script>'],
    ['//evil.example'],
    ['mybalaimobile://user:pass@host/x'],
    ['mybalaimobile://payment-return#https://evil.example'],
    ['not a url'],
    [''],
  ])('rejects %s', (url) => {
    expect(isAllowedAppReturnUrl(url, dev)).toBe(false)
    expect(isAllowedAppReturnUrl(url, prod)).toBe(false)
  })
})

describe('bridge + app return URLs', () => {
  const ids = { paymentId: 42, bookingId: 7, result: 'success' as const }

  it('builds a bridge URL that round-trips the app address', () => {
    const url = new URL(
      bridgeUrl(
        'https://mybalai.example',
        'mybalaimobile://payment-return',
        ids,
      ),
    )
    expect(url.origin + url.pathname).toBe('https://mybalai.example/pay/return')
    expect(url.searchParams.get('to')).toBe('mybalaimobile://payment-return')
    expect(url.searchParams.get('payment')).toBe('42')
    expect(url.searchParams.get('booking')).toBe('7')
    expect(url.searchParams.get('result')).toBe('success')
  })

  it('appends the payment details to the app address', () => {
    expect(appReturnRedirect('mybalaimobile://payment-return', ids)).toBe(
      'mybalaimobile://payment-return?payment=42&booking=7&result=success',
    )
    expect(
      appReturnRedirect('exp://192.168.1.19:8081/--/payment-return', {
        ...ids,
        result: 'cancelled',
      }),
    ).toBe(
      'exp://192.168.1.19:8081/--/payment-return?payment=42&booking=7&result=cancelled',
    )
  })

  it('validates the result value', () => {
    expect(isPaymentReturnResult('success')).toBe(true)
    expect(isPaymentReturnResult('cancelled')).toBe(true)
    expect(isPaymentReturnResult('paid')).toBe(false)
    expect(isPaymentReturnResult(null)).toBe(false)
  })
})

describe('resolveCheckoutOrigin', () => {
  it('uses the configured site URL in production, ignoring the request host', () => {
    expect(
      resolveCheckoutOrigin('http://internal-host:3000/api/x', {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://mybalai.example/',
      }),
    ).toBe('https://mybalai.example')
  })

  it('returns null in production when no site URL is configured', () => {
    expect(
      resolveCheckoutOrigin('http://x/api', { NODE_ENV: 'production' }),
    ).toBeNull()
  })

  it('uses the address the phone reached us on in development', () => {
    expect(
      resolveCheckoutOrigin('http://192.168.1.19:3000/api/mobile/x', {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).toBe('http://192.168.1.19:3000')
  })
})
