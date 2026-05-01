'use client'

import { useEffect, useRef } from 'react'
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
  const autocompleteRef = useRef<any>(null)

  useEffect(() => {
    // Modern Google Maps Library Loader (2026 Standard)
    const init = async () => {
      if (!inputRef.current) return
      
      try {
        // Load the new Places library
        const { Autocomplete } = await (window as any).google.maps.importLibrary("places")
        
        if (autocompleteRef.current) return

        autocompleteRef.current = new Autocomplete(inputRef.current, {
          types: ['establishment', 'address'],
          fields: ['formatted_address', 'geometry', 'name'],
        })

        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current.getPlace()
          if (!place?.geometry?.location || !place.formatted_address) return

          const lat = place.geometry.location.lat()
          const lng = place.geometry.location.lng()
          const formattedAddress = place.formatted_address
          const name = place.name

          if (inputRef.current) {
            inputRef.current.value = formattedAddress
          }
          
          onPlaceSelect({ formattedAddress, lat, lng, name })
        })
      } catch (err) {
        console.error('Google Maps Autocomplete Error:', err)
      }
    }

    if (typeof window !== 'undefined' && (window as any).google?.maps) {
      init()
    } else {
      (window as any).initAutocomplete = init
    }
  }, [])

  return (
    <>
      <Script
        id="google-maps-loader"
        src={`https://maps.googleapis.com/maps/api/js?key=${(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim()}&libraries=places&v=weekly`}
        strategy="afterInteractive"
        onLoad={() => {
          if ((window as any).initAutocomplete) (window as any).initAutocomplete()
        }}
      />
      <input
        ref={inputRef}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
    </>
  )
}
