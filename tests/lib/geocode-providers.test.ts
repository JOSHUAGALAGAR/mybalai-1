import { describe, expect, it, vi } from 'vitest'

import {
  joinLabel,
  reverseAddress,
  searchAddress,
  type Fetcher,
} from '@/lib/geocode/providers'

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
})
const down = { ok: false, status: 503, json: async () => ({}) }

const photon = (...features: object[]) => ok({ features })
const feature = (props: object, lng = 120.5975, lat = 16.4125) => ({
  geometry: { coordinates: [lng, lat] },
  properties: { countrycode: 'PH', osm_type: 'W', osm_id: 1, ...props },
})

describe('joinLabel', () => {
  it('drops blanks and duplicates (case-insensitive)', () => {
    expect(joinLabel(['Baguio', '', undefined, 'baguio', ' Benguet '])).toBe(
      'Baguio, Benguet',
    )
  })
})

describe('searchAddress', () => {
  it('builds a readable label and keeps the coordinates', async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      photon(
        feature({
          name: 'Session Road',
          district: 'District 10',
          city: 'Baguio',
          state: 'Cordillera Administrative Region',
        }),
      ),
    )
    const [place] = await searchAddress('session road', fetcher)
    expect(place).toMatchObject({
      label:
        'Session Road, District 10, Baguio, Cordillera Administrative Region',
      lat: 16.4125,
      lng: 120.5975,
    })
    expect(place.id).toBe('osm:W:1')
  })

  it('only asks for the Philippines', async () => {
    const fetcher = vi.fn<Fetcher>(async () => photon())
    await searchAddress('x y', fetcher).catch(() => {})
    expect(fetcher.mock.calls[0][0]).toContain('bbox=116.9,4.5,127.0,21.5')
  })

  it('drops results outside the Philippines and points that are not on Earth', async () => {
    const fetcher: Fetcher = async () =>
      photon(
        feature({ name: 'Elsewhere', countrycode: 'US' }),
        feature({ name: 'Ocean' }, 0, 0),
        feature({ name: 'Keep', city: 'Cebu' }, 123.9, 10.3),
      )
    const places = await searchAddress('anything', fetcher)
    expect(places.map((p) => p.label)).toEqual(['Keep, Cebu'])
  })

  it('falls back to Nominatim when Photon is down', async () => {
    const fetcher = vi.fn<Fetcher>(async (url: string) =>
      url.includes('photon')
        ? down
        : ok([
            {
              osm_type: 'way',
              osm_id: 5,
              lat: '16.41',
              lon: '120.59',
              display_name: 'Session Road, Baguio, Philippines',
            },
          ]),
    )
    const places = await searchAddress('session road', fetcher)
    expect(places).toEqual([
      {
        id: 'osm:way:5',
        label: 'Session Road, Baguio',
        lat: 16.41,
        lng: 120.59,
      },
    ])
  })

  it('also falls back when Photon answers with nothing usable', async () => {
    const fetcher = vi.fn<Fetcher>(async (url: string) =>
      url.includes('photon')
        ? photon()
        : ok([
            {
              osm_type: 'node',
              osm_id: 9,
              lat: '10.3',
              lon: '123.9',
              display_name: 'Colon St, Cebu City',
            },
          ]),
    )
    expect((await searchAddress('colon', fetcher)).length).toBe(1)
  })

  it('throws when both providers fail, so the caller can say so', async () => {
    await expect(searchAddress('x y z', async () => down)).rejects.toThrow()
  })

  it('URL-encodes what the user typed', async () => {
    const fetcher = vi.fn<Fetcher>(async () => photon(feature({ name: 'A' })))
    await searchAddress('Rizal St. & 5th', fetcher)
    expect(fetcher.mock.calls[0][0]).toContain('q=Rizal%20St.%20%26%205th')
  })

  it('identifies itself to the public servers', async () => {
    const fetcher = vi.fn<Fetcher>(async () => photon(feature({ name: 'A' })))
    await searchAddress('abc', fetcher)
    expect(fetcher.mock.calls[0][1]?.headers?.['User-Agent']).toMatch(/MyBalai/)
  })
})

describe('reverseAddress', () => {
  it('keeps the pin the user dropped, not the geocoder’s snapped point', async () => {
    const fetcher: Fetcher = async () =>
      photon(feature({ name: 'Circle', city: 'Baguio' }, 120.6, 16.4))
    const place = await reverseAddress(16.4023, 120.596, fetcher)
    expect(place).toMatchObject({
      label: 'Circle, Baguio',
      lat: 16.4023,
      lng: 120.596,
    })
  })

  it('returns null instead of throwing when nothing is found or both are down', async () => {
    expect(await reverseAddress(16.4, 120.6, async () => down)).toBeNull()
  })
})
