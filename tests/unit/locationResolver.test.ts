import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveLocation, resolveLocationAsync } from '../../src/utils/locationResolver.js';
import { LocationStore } from '../../src/services/locationStore.js';
import type { GeocodingService } from '../../src/services/geocoding.js';

describe('locationResolver', () => {
  let storeDir: string;
  let storePath: string;
  let locationStore: LocationStore;
  let geocodingService: GeocodingService;

  beforeEach(() => {
    storeDir = mkdtempSync(join(tmpdir(), 'weather-mcp-loc-'));
    storePath = join(storeDir, 'locations.json');
    locationStore = new LocationStore(storePath);

    geocodingService = {
      geocode: vi.fn().mockResolvedValue([
        {
          name: 'Seattle',
          display_name: 'Seattle, Washington, United States',
          latitude: 47.6062,
          longitude: -122.3321,
          confidence: 'high' as const,
          source: 'nominatim' as const
        }
      ])
    } as unknown as GeocodingService;
  });

  afterEach(() => {
    rmSync(storeDir, { recursive: true, force: true });
  });

  describe('resolveLocationAsync', () => {
    it('should geocode city_name when no coordinates or saved location', async () => {
      const result = await resolveLocationAsync(
        { city_name: 'Seattle, WA' },
        locationStore,
        geocodingService
      );

      expect(geocodingService.geocode).toHaveBeenCalledWith('Seattle, WA', 1);
      expect(result).toEqual({
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'geocoded',
        display_name: 'Seattle, Washington, United States'
      });
    });

    it('should prefer coordinates over city_name', async () => {
      const result = await resolveLocationAsync(
        { latitude: 40.7128, longitude: -74.006, city_name: 'Seattle, WA' },
        locationStore,
        geocodingService
      );

      expect(geocodingService.geocode).not.toHaveBeenCalled();
      expect(result.source).toBe('coordinates');
      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.006);
    });

    it('should prefer saved location_name over city_name', async () => {
      locationStore.set('home', {
        name: 'Home',
        latitude: 47.6,
        longitude: -122.3
      });

      const result = await resolveLocationAsync(
        { location_name: 'home', city_name: 'Paris, France' },
        locationStore,
        geocodingService
      );

      expect(geocodingService.geocode).not.toHaveBeenCalled();
      expect(result.source).toBe('saved_location');
      expect(result.location_name).toBe('home');
    });

    it('should reject empty city_name', async () => {
      await expect(
        resolveLocationAsync({ city_name: '   ' }, locationStore, geocodingService)
      ).rejects.toThrow('city_name cannot be empty');
    });

    it('should require a location input', async () => {
      await expect(
        resolveLocationAsync({}, locationStore, geocodingService)
      ).rejects.toThrow(/city_name/);
    });
  });

  describe('resolveLocation (sync)', () => {
    it('should still resolve saved locations', () => {
      locationStore.set('home', {
        name: 'Home',
        latitude: 47.6,
        longitude: -122.3
      });

      const result = resolveLocation(
        { location_name: 'home' },
        locationStore
      );

      expect(result.source).toBe('saved_location');
      expect(result.location_name).toBe('home');
    });
  });
});
