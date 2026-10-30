/**
 * Honest Location Service for Nivara
 * Handles GPS Geolocation with timeout, optional IP Geolocation fallback,
 * and reports location availability truthfully without fabricating coordinates.
 */

export async function getUserLocation(options = {}) {
  // 1. Try Browser Geolocation with timeout
  if (typeof window !== 'undefined' && navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) => {
        let finished = false;
        const timeoutMs = options.timeout || 10000;

        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            reject(new Error('Geolocation timeout'));
          }
        }, timeoutMs);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve(pos);
            }
          },
          (err) => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              reject(err);
            }
          },
          {
            enableHighAccuracy: options.enableHighAccuracy !== undefined ? options.enableHighAccuracy : true,
            timeout: timeoutMs,
            maximumAge: options.maximumAge !== undefined ? options.maximumAge : 5000
          }
        );
      });

      if (position && position.coords && typeof position.coords.latitude === 'number') {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return {
            latitude: lat,
            longitude: lng,
            location_label: `Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            accuracy: position.coords.accuracy,
            source: 'gps',
            has_location: true,
            timestamp: position.timestamp || Date.now()
          };
        }
      }
    } catch (geoErr) {
      console.warn('GPS Geolocation unavailable or denied:', geoErr.message);
      return {
        latitude: null,
        longitude: null,
        location_label: 'Location unavailable / permission denied',
        accuracy: null,
        source: 'unavailable',
        has_location: false,
        error: getGeolocationErrorDetails(geoErr)
      };
    }
  }

  // 2. Truthful fallback: never fabricate false coordinates or silently substitute IP coordinates
  return {
    latitude: null,
    longitude: null,
    location_label: 'Location unavailable / permission denied',
    accuracy: null,
    source: 'unavailable',
    has_location: false,
    error: getGeolocationErrorDetails(new Error('Geolocation not supported by browser'))
  };
}

export function getGeolocationErrorDetails(err) {
  if (!err) {
    return {
      code: 'unknown',
      status: 'unavailable',
      label: 'Unknown Error',
      message: 'Unknown location error',
      userGuide: 'Please check your device location settings and try again.'
    };
  }
  if (typeof err === 'string') {
    return {
      code: 'custom',
      status: 'unavailable',
      label: 'Location Error',
      message: err,
      userGuide: 'Check your browser location settings.'
    };
  }

  // GeolocationPositionError codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  const code = err.code;
  if (code === 1 || err.message?.toLowerCase().includes('denied') || err.message?.toLowerCase().includes('permission')) {
    return {
      code: 'permission_denied',
      status: 'permission_denied',
      label: 'Permission Denied',
      message: 'Location access was blocked or denied by the browser.',
      userGuide: 'Click the site settings / lock icon in your browser address bar and set Location to "Allow", then click Retry.'
    };
  }
  if (code === 2 || err.message?.toLowerCase().includes('unavailable')) {
    return {
      code: 'position_unavailable',
      status: 'unavailable',
      label: 'Position Unavailable',
      message: 'Location signal or provider unavailable on this device.',
      userGuide: 'Ensure device location services or Wi-Fi is enabled on your laptop/computer, then click Retry.'
    };
  }
  if (code === 3 || err.message?.toLowerCase().includes('timeout')) {
    return {
      code: 'timeout',
      status: 'timeout',
      label: 'GPS Timeout',
      message: 'Location acquisition timed out.',
      userGuide: 'The GPS request took too long. Click Retry to request your position again.'
    };
  }

  return {
    code: 'failed',
    status: 'failed',
    label: 'Location Error',
    message: err.message || 'Could not acquire coordinates.',
    userGuide: 'Please click Retry to re-attempt location acquisition.'
  };
}

export function getOfficerCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject({
        code: 'not_supported',
        status: 'unavailable',
        label: 'Not Supported',
        message: 'Browser does not support geolocation',
        userGuide: 'Please use a modern browser that supports GPS geolocation.'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (pos && pos.coords && typeof pos.coords.latitude === 'number') {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            resolve({
              latitude: lat,
              longitude: lng,
              location_label: `Field GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
              accuracy: pos.coords.accuracy,
              source: 'gps',
              has_location: true
            });
            return;
          }
        }
        reject({
          code: 'invalid_coords',
          status: 'unavailable',
          label: 'Invalid Coordinates',
          message: 'Received invalid coordinates from browser',
          userGuide: 'Please click Retry to acquire valid coordinates.'
        });
      },
      (err) => {
        reject(getGeolocationErrorDetails(err));
      },
      {
        enableHighAccuracy: true,
        timeout: options.timeout || 10000,
        maximumAge: options.maximumAge !== undefined ? options.maximumAge : 5000
      }
    );
  });
}

export function watchUserLocation(onLocation, onError, options = {}) {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    if (onError) onError(getGeolocationErrorDetails(new Error('Geolocation not supported')));
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (pos && pos.coords && typeof pos.coords.latitude === 'number') {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          onLocation({
            latitude: lat,
            longitude: lng,
            location_label: `Field GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            accuracy: pos.coords.accuracy,
            source: 'gps',
            has_location: true
          });
        }
      }
    },
    (err) => {
      if (onError) onError(getGeolocationErrorDetails(err));
    },
    {
      enableHighAccuracy: true,
      maximumAge: options.maximumAge !== undefined ? options.maximumAge : 10000,
      timeout: options.timeout || 15000
    }
  );
  return () => {
    try {
      navigator.geolocation.clearWatch(watchId);
    } catch (e) {}
  };
}

