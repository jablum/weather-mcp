/**
 * Utility for resolving location coordinates from various input formats
 */

import type { GeocodingService } from '../services/geocoding.js';
import { LocationStore } from '../services/locationStore.js';
import { validateLatitude, validateLongitude } from './validation.js';

export interface LocationInput {
  latitude?: number;
  longitude?: number;
  location_name?: string;
  city_name?: string;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  source: 'coordinates' | 'saved_location' | 'geocoded';
  location_name?: string;
  display_name?: string;
}

function hasCoordinates(args: LocationInput): boolean {
  return typeof args.latitude === 'number' && typeof args.longitude === 'number';
}

function hasLocationName(args: LocationInput): boolean {
  return typeof args.location_name === 'string' && args.location_name.trim().length > 0;
}

function resolveSavedLocation(
  locationName: string,
  locationStore: LocationStore
): ResolvedLocation {
  const normalizedName = locationName.toLowerCase().trim();

  let savedLocation = locationStore.get(normalizedName);
  let matchedAlias = normalizedName;

  if (!savedLocation) {
    const allLocations = locationStore.getAll();

    for (const [alias, location] of Object.entries(allLocations)) {
      if (location.alternateNames && location.alternateNames.length > 0) {
        const normalizedAlternates = location.alternateNames.map(name =>
          name.toLowerCase().trim()
        );

        if (normalizedAlternates.includes(normalizedName)) {
          savedLocation = location;
          matchedAlias = alias;
          break;
        }
      }
    }
  }

  if (!savedLocation) {
    const available = Object.keys(locationStore.getAll());
    throw new Error(
      `Saved location "${normalizedName}" not found.\n\n` +
      (available.length > 0
        ? `Available locations: ${available.join(', ')}\n\n`
        : 'No saved locations yet. Use save_location to create one.\n\n') +
      `Use list_saved_locations to see all saved locations.`
    );
  }

  return {
    latitude: savedLocation.latitude,
    longitude: savedLocation.longitude,
    source: 'saved_location',
    location_name: matchedAlias
  };
}

/**
 * Resolve location coordinates from either direct coordinates or a saved location name
 *
 * @param args - Arguments containing either (latitude + longitude) OR location_name
 * @param locationStore - Location store instance
 * @returns Resolved coordinates and metadata
 * @throws Error if neither coordinates nor location_name provided, or if validation fails
 */
export function resolveLocation(
  args: LocationInput,
  locationStore: LocationStore
): ResolvedLocation {
  // Check if location_name is provided
  if (args.location_name && typeof args.location_name === 'string') {
    const locationName = args.location_name.toLowerCase().trim();

    if (locationName.length === 0) {
      throw new Error('location_name cannot be empty');
    }

    return resolveSavedLocation(locationName, locationStore);
  }

  // Check if direct coordinates are provided
  if (hasCoordinates(args)) {
    validateLatitude(args.latitude!);
    validateLongitude(args.longitude!);

    return {
      latitude: args.latitude!,
      longitude: args.longitude!,
      source: 'coordinates'
    };
  }

  // Neither location_name nor coordinates provided
  throw new Error(
    'Either location_name OR (latitude + longitude) must be provided.\n\n' +
    'Examples:\n' +
    '  - Using coordinates: latitude=47.6062, longitude=-122.3321\n' +
    '  - Using saved location: location_name="home"\n\n' +
    'Use save_location to save frequently used locations.'
  );
}

/**
 * Resolve location coordinates from coordinates, saved location name, or city name (geocoded)
 *
 * Priority: coordinates > location_name > city_name
 */
export async function resolveLocationAsync(
  args: LocationInput,
  locationStore: LocationStore,
  geocodingService: GeocodingService
): Promise<ResolvedLocation> {
  if (hasCoordinates(args)) {
    validateLatitude(args.latitude!);
    validateLongitude(args.longitude!);

    return {
      latitude: args.latitude!,
      longitude: args.longitude!,
      source: 'coordinates'
    };
  }

  if (hasLocationName(args)) {
    const locationName = args.location_name!.trim();
    if (locationName.length === 0) {
      throw new Error('location_name cannot be empty');
    }
    return resolveSavedLocation(locationName, locationStore);
  }

  if (typeof args.city_name === 'string') {
    const cityName = args.city_name.trim();
    if (cityName.length === 0) {
      throw new Error('city_name cannot be empty');
    }

    const results = await geocodingService.geocode(cityName, 1);
    const match = results[0];

    return {
      latitude: match.latitude,
      longitude: match.longitude,
      source: 'geocoded',
      display_name: match.display_name || match.name
    };
  }

  throw new Error(
    'Either city_name, location_name, OR (latitude + longitude) must be provided.\n\n' +
    'Examples:\n' +
    '  - Using city name: city_name="Seattle, WA"\n' +
    '  - Using coordinates: latitude=47.6062, longitude=-122.3321\n' +
    '  - Using saved location: location_name="home"\n\n' +
    'Use save_location to save frequently used locations.'
  );
}
