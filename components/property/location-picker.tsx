'use client'

import 'leaflet/dist/leaflet.css'

import type { Map as LeafletMap, Marker } from 'leaflet'
import { LocateFixed, MapPin, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { geocodeClient, type GeocodeClient } from '@/lib/geocode/client'
import type { Place } from '@/lib/geocode/providers'

type Pin = { lat: number; lng: number }

const PH_CENTER: Pin = { lat: 12.88, lng: 121.77 }
const DEBOUNCE_MS = 400

type MoveOptions = { lookup?: boolean; recenter?: boolean }

const toPin = (lat?: string, lng?: string): Pin | null => {
  if (lat === undefined || lng === undefined || lat === '' || lng === '') {
    return null
  }
  const a = Number(lat)
  const b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null
}

/**
 * The property's address with a map pin. Typing searches OpenStreetMap (through our own
 * `/api/geocode`, Philippines only); choosing a result drops the pin; the pin can be dragged or
 * the map clicked to fine-tune it. Submits `address`, `latitude` and `longitude` with the form.
 */
export function LocationPicker({
  initialAddress = '',
  initialLat,
  initialLng,
  geocoder = geocodeClient,
  invalid,
}: {
  initialAddress?: string
  initialLat?: string
  initialLng?: string
  /** Swappable for tests. */
  geocoder?: GeocodeClient
  invalid?: boolean
}) {
  const listId = useId()
  const [address, setAddress] = useState(initialAddress)
  const [pin, setPinState] = useState<Pin | null>(() =>
    toPin(initialLat, initialLng),
  )
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pinAddress, setPinAddress] = useState<string | null>(null)

  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const reverseAbort = useRef<AbortController | null>(null)
  const startPin = useRef(pin) // where the map opens (the saved pin, if any)
  const movePin = useRef<(next: Pin | null, opts?: MoveOptions) => void>(
    () => {},
  )

  /** Move the pin (from typing, clicking, dragging or GPS) and look up its address. */
  const setPin = useCallback(
    (next: Pin | null, opts: MoveOptions = {}) => {
      setPinState(next)
      setPinAddress(null)
      const m = map.current
      const L = leaflet.current
      if (m && L) {
        if (!next) {
          marker.current?.remove()
          marker.current = null
        } else {
          if (marker.current) marker.current.setLatLng(next)
          else {
            marker.current = L.marker(next, {
              draggable: true,
              icon: pinIcon(L),
              keyboard: true,
              title: 'Drag to adjust the location',
            })
              .addTo(m)
              .on('dragend', (e) => {
                const at = (e.target as Marker).getLatLng()
                movePin.current({ lat: at.lat, lng: at.lng }, { lookup: true })
              })
          }
          if (opts.recenter) m.setView(next, Math.max(m.getZoom(), 17))
        }
      }
      if (next && opts.lookup) {
        reverseAbort.current?.abort()
        const controller = (reverseAbort.current = new AbortController())
        geocoder
          .reverse(next.lat, next.lng, controller.signal)
          .then((r) => {
            if (r.ok && r.data.place) setPinAddress(r.data.place.label)
          })
          .catch(() => {})
      }
    },
    [geocoder],
  )

  useEffect(() => {
    movePin.current = setPin
  }, [setPin])

  // Build the map once (Leaflet touches `window`, so it is loaded on the client only).
  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((L) => {
      if (cancelled || !mapEl.current || map.current) return
      leaflet.current = L
      const start = startPin.current
      const m = L.map(mapEl.current, {
        center: start ?? PH_CENTER,
        zoom: start ? 17 : 5,
        scrollWheelZoom: false, // the page scrolls; two-finger / ctrl-scroll zoom is enough
      })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m)
      m.on('click', (e) =>
        movePin.current(
          { lat: e.latlng.lat, lng: e.latlng.lng },
          { lookup: true },
        ),
      )
      map.current = m
      if (start) movePin.current(start)
      // The container may have been laid out after Leaflet measured it.
      setTimeout(() => m.invalidateSize(), 0)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      marker.current = null
    }
  }, [])

  // Search as the landlord types.
  useEffect(() => {
    const q = address.trim()
    if (!open || q.length < 3) return
    const timer = setTimeout(async () => {
      searchAbort.current?.abort()
      const controller = (searchAbort.current = new AbortController())
      setSearching(true)
      try {
        const r = await geocoder.search(q, controller.signal)
        if (controller.signal.aborted) return
        if (r.ok) {
          setResults(r.data.places)
          setNote(
            r.data.places.length === 0
              ? 'No matches. Try a nearby street or barangay, or click the map to drop a pin.'
              : null,
          )
        } else {
          setResults([])
          setNote(r.message)
        }
        setActive(-1)
      } catch {
        return // superseded by a newer search
      }
      setSearching(false)
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      searchAbort.current?.abort()
    }
  }, [address, open, geocoder])
  const canSearch = open && address.trim().length >= 3
  const shown = canSearch ? results : []

  function choose(place: Place) {
    setAddress(place.label)
    setOpen(false)
    setResults([])
    setNote(null)
    setPin({ lat: place.lat, lng: place.lng }, { recenter: true })
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setNote('This browser cannot share your location.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setPin(
          { lat: p.coords.latitude, lng: p.coords.longitude },
          { lookup: true, recenter: true },
        ),
      () =>
        setNote(
          'Could not get your location. Allow location access, or search instead.',
        ),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || shown.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % shown.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? shown.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault() // don't submit the form while choosing
      choose(shown[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          id="address"
          name="address"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          required
          maxLength={500}
          placeholder="Start typing the street, barangay or landmark…"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
        {open && shown.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="bg-popover text-popover-foreground absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-lg border shadow-md"
          >
            {shown.map((place, i) => (
              <li
                key={place.id}
                role="option"
                aria-selected={i === active}
                // mousedown fires before the input's blur, so the click is not lost
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(place)
                }}
                className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
                  i === active ? 'bg-muted' : 'hover:bg-muted/60'
                }`}
              >
                <MapPin
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <span>{place.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searching && canSearch && (
        <p role="status" className="text-muted-foreground text-xs">
          Searching…
        </p>
      )}
      {note && (
        <p role="status" className="text-muted-foreground text-xs">
          {note}
        </p>
      )}

      <div
        ref={mapEl}
        aria-label="Map — click to place the pin, drag the pin to adjust"
        className="bg-muted relative z-0 h-72 w-full overflow-hidden rounded-lg border"
      />

      <input
        type="hidden"
        name="latitude"
        value={pin ? pin.lat.toFixed(6) : ''}
      />
      <input
        type="hidden"
        name="longitude"
        value={pin ? pin.lng.toFixed(6) : ''}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={useMyLocation}
        >
          <LocateFixed /> Use my location
        </Button>
        {pin && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPin(null)}
          >
            <X /> Remove pin
          </Button>
        )}
        <span
          className="text-muted-foreground text-xs"
          data-testid="pin-status"
        >
          {pin
            ? `Pin saved at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
            : 'No pin yet — choose a suggestion or click the map.'}
        </span>
      </div>

      {pinAddress && pinAddress !== address && (
        <p className="text-sm">
          Address at this pin: <strong>{pinAddress}</strong>{' '}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => {
              setAddress(pinAddress)
              setPinAddress(null)
            }}
          >
            Use this address
          </button>
        </p>
      )}
    </div>
  )
}

/** A teardrop pin drawn inline, so no image files (which bundlers often break) are needed. */
function pinIcon(L: typeof import('leaflet')) {
  return L.divIcon({
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    html: `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 0C7.2 0 0 7 0 15.7 0 27.5 16 40 16 40s16-12.5 16-24.3C32 7 24.8 0 16 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15" r="6" fill="#fff"/></svg>`,
  })
}
