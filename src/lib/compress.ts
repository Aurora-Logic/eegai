import imageCompression from 'browser-image-compression'
// Served from our own build. Left unset, the library's worker fetches itself
// from cdn.jsdelivr.net on every compression: a third-party request from a
// donor's phone, a photo step that cannot work offline, and — when the CDN is
// slow — an upload stuck on "Compressing…". That stall is what made the
// post-item e2e test fail one run in two.
import libURL from 'browser-image-compression/dist/browser-image-compression.js?url'

/** Every photo is shrunk on the phone before upload; one setting for all of them. */
export function compressPhoto(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: 1600,
    maxSizeMB: 0.4,
    useWebWorker: true,
    libURL: new URL(libURL, window.location.href).href,
  })
}
