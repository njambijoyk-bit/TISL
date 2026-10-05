/** Take a still from a video file in the browser (so no video software is needed on the server) and return it as a JPEG file, or null. */
export default function posterFrom(file) {
  return new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  const done = (out) => { URL.revokeObjectURL(url); resolve(out); };
  v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
  v.onerror = () => done(null);
  v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 4); } catch { done(null); } };
  v.onseeked = () => {
    const w = Math.min(960, v.videoWidth || 960); const h = Math.round(w * ((v.videoHeight || 540) / (v.videoWidth || 960)));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(v, 0, 0, w, h);
    cv.toBlob((b) => done(b ? new File([b], 'poster.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.82);
  };
  setTimeout(() => done(null), 8000);
  });
}
