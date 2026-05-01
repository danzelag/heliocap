'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

export interface PlaceResult {
  formattedAddress: string
  lat: number
  lng: number
  name?: string
}

interface Props {
  defaultValue?: string
  name: string
  required?: boolean
  placeholder?: string
  className?: string
  onPlaceSelect: (result: PlaceResult) => void
}

export default function AddressAutocomplete({
  defaultValue = '',
  name,
  required,
  placeholder = 'Start typing an address...',
  className,
  onPlaceSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [value, setValue] = useState(defaultValue)

  // If script already loaded when this component mounts (e.g. second form on page),
  // init immediately without waiting for onLoad.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.google?.maps?.places) {
      initAutocomplete()
    }
  }, [])

  function initAutocomplete() {
    if (!inputRef.current || autocompleteRef.current) return
    if (!window.google?.maps?.places) return

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'address'],
      fields: ['formatted_address', 'geometry', 'name'],
    })

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      if (!place?.geometry?.location || !place.formatted_address) return

      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()
      const formattedAddress = place.formatted_address
      const name = place.name

      setValue(formattedAddress)
      onPlaceSelect({ formattedAddress, lat, lng, name })
    })
  }

  return (
    <>
      <Script
        id="google-maps-places"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`}
        strategy="lazyOnload"
        onLoad={initAutocomplete}
      />
      <input
        ref={inputRef}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
    </>
  )
}
